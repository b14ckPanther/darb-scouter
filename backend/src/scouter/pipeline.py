"""The daily scan: collect -> filter -> dedupe -> store -> extract (cached) -> score -> index -> alert."""

import logging
import re
from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Literal, Protocol

import httpx
from sqlalchemy.orm import Session

from scouter import repo
from scouter.collectors.base import Collector
from scouter.config import get_settings
from scouter.db import JobRow
from scouter.dedupe import dedupe
from scouter.embed import Embedder
from scouter.extract.graph import content_hash, extract_profile
from scouter.extract.llm import LLM
from scouter.filters import drop_reason, hidden_reason, region_label, region_of
from scouter.http import polite_client
from scouter.models import Job, JobProfile, RawJob, RunSummary, SourceResult
from scouter.scoring import score

log = logging.getLogger(__name__)
Alert = Callable[[RunSummary, list[Job]], int]
_SENIORITY_LABEL = {
    "intern": "intern",
    "junior": "junior",
    "mid": "middle",
    "senior+": "senior",
    "unknown": "unlabeled",
}


class Indexer(Protocol):
    def index(self, job: Job, text: str) -> None: ...


def city_of(location: str | None) -> str:
    city = (location or "").split(",")[0]
    city = re.sub(r"-(Yafo|Jaffa)\b", "", city, flags=re.I).strip()
    return "Israel (remote or hybrid)" if not city or city.lower() == "israel" else city


def _score_row(session: Session, job_id: str, raw: RawJob, jp: JobProfile, version: int) -> Job | None:
    """Scores one job against the current profile. Returns None when the job is hidden."""
    profile = repo.current_profile(session)
    s = score(jp, profile, region_label(region_of(raw.location)))
    repo.save_score(session, job_id, version, s)
    hidden = hidden_reason(raw, jp, profile)
    seniority = raw.seniority if raw.seniority and jp.seniority == "unknown" else _SENIORITY_LABEL[jp.seniority]
    repo.mark_scored(
        session,
        job_id,
        city=city_of(raw.location),
        work_mode=jp.work_mode or raw.work_mode or "onsite",
        seniority=seniority,
        hidden_reason=hidden,
    )
    return None if hidden else repo.get_job(session, job_id)


def process_job(
    session: Session,
    row: JobRow,
    llm: LLM,
    indexer: Indexer | None = None,
    *,
    embedder: Embedder | None = None,
    model: str,
) -> Job | Literal["defense"] | None:
    """Extract (or reuse the cached extraction), then drop, hide or score one stored job.

    Returns the scored job, "defense" when it was dropped, or None when it is stored but hidden.
    Raises when extraction fails; the job then stays pending.
    """
    raw = repo.raw_of(row)
    profile = repo.current_profile(session)
    key = content_hash(raw, model)
    jp = repo.get_profile_cache(session, key)
    if jp is None:
        jp, _ = extract_profile(raw, llm, embedder, model=model)
        repo.put_profile_cache(session, key, model, jp)
    row.content_hash = key
    if drop_reason(raw, jp, profile) == "defense":
        repo.delete_job(session, row.id)
        return "defense"
    job = _score_row(session, row.id, raw, jp, profile.version)
    if job and indexer:
        try:
            indexer.index(job, raw.text)
        except Exception:  # noqa: BLE001 - search is a convenience; the scan still counts
            log.exception("indexing failed for %s", row.id)
    return job


def run_scan(
    session: Session,
    collectors: Sequence[Collector],
    llm: LLM,
    indexer: Indexer | None,
    now: datetime,
    alert: Alert | None = None,
    *,
    client: httpx.Client | None = None,
    embedder: Embedder | None = None,
    model: str | None = None,
) -> RunSummary:
    model = model or get_settings().model_default
    run_id = repo.start_run(session, now)
    try:
        return _scan(session, run_id, collectors, llm, indexer, now, alert, client, embedder, model)
    except BaseException as e:
        # a crash is recorded on the run, so the Radar shows it and the scheduler retries it
        session.rollback()
        repo.fail_run(session, run_id, f"{type(e).__name__}: {e}")
        raise


def _scan(
    session: Session,
    run_id: int,
    collectors: Sequence[Collector],
    llm: LLM,
    indexer: Indexer | None,
    now: datetime,
    alert: Alert | None,
    client: httpx.Client | None,
    embedder: Embedder | None,
    model: str,
) -> RunSummary:
    summary = RunSummary(started_at=repo.iso(now))
    profile = repo.current_profile(session)
    own_client = client is None
    http = client or polite_client()

    # 1. collect: every collector on its own, so one failure never stops the others
    origin: dict[str, str] = {}
    collected: list[RawJob] = []
    for c in collectors:
        result = SourceResult()
        try:
            jobs = c.collect(http)
            result.found = len(jobs)
            for j in jobs:
                origin[j.url] = c.name
            collected += jobs
            partial = getattr(c, "failures", None)
            if partial:
                result.error = f"{len(partial)} board(s) failed: " + "; ".join(partial[:5])
        except Exception as e:  # noqa: BLE001 - a collector failure is recorded, never raised
            log.exception("collector %s failed", c.name)
            result.failed, result.error = True, f"{type(e).__name__}: {e}"
        summary.per_source[c.name] = result
    if own_client:
        http.close()

    # 2. drop what Nour never wants to see before spending anything on it, then store
    new_ids: set[str] = set()
    for raw in dedupe(collected):
        reason = drop_reason(raw, JobProfile(), profile)
        if reason:
            summary.dropped[reason] = summary.dropped.get(reason, 0) + 1
            continue
        job_id, is_new = repo.upsert_job(session, raw, now)
        if is_new:
            new_ids.add(job_id)
            summary.per_source[origin.get(raw.url, raw.source)].new += 1
    summary.new_jobs = len(new_ids)

    # 3. extract (cached by content hash) and score every pending job, including earlier failures
    matches: list[Job] = []
    new_scores: list[int] = []
    for row in repo.pending_jobs(session):
        try:
            outcome = process_job(session, row, llm, indexer, embedder=embedder, model=model)
        except Exception:  # noqa: BLE001 - the job stays pending and is retried next run
            session.rollback()  # one failed job must not poison the session for the rest
            log.exception("extraction failed for %s", row.url)
            summary.pending += 1
            continue
        if outcome == "defense":
            summary.dropped["defense"] = summary.dropped.get("defense", 0) + 1
        elif outcome and row.id in new_ids:
            new_scores.append(outcome.score.total)
            if outcome.score.total > profile.alert_threshold:
                matches.append(outcome)
    summary.new_matches = len(matches)
    summary.top_score = max(new_scores, default=None)

    # 4. alert; a failed message is counted, never fatal
    if alert:
        try:
            summary.alerts_failed = alert(summary, matches)
        except Exception:  # noqa: BLE001
            log.exception("alerts failed")
            summary.alerts_failed = len(matches) + 1
    return repo.finish_run(session, run_id, summary)


def rescore_all(session: Session) -> int:
    """Rescore every scored job against the current profile from cached extractions. No LLM calls."""
    profile = repo.current_profile(session)
    n = 0
    for row in repo.scored_jobs(session):
        jp = repo.get_profile_cache(session, row.content_hash) if row.content_hash else None
        if jp is None:
            continue
        _score_row(session, row.id, repo.raw_of(row), jp, profile.version)
        n += 1
    return n
