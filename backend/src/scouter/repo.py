"""Every read and write the app makes. Functions take a Session first and commit their own work."""

import hashlib
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from scouter.db import (
    ApplicationRow,
    BoardRow,
    EventRow,
    JobProfileRow,
    JobRow,
    ProfileRow,
    RunRow,
    ScoreRow,
)
from scouter.models import (
    Application,
    Board,
    Job,
    JobProfile,
    Profile,
    RawJob,
    RunSummary,
    Score,
    Stage,
    StageEntry,
    WorkMode,
)
from scouter.profile import load_seed

__all__ = ["RunSummary"]


def iso(dt: datetime) -> str:
    """The frontend's timestamp format, e.g. 2026-10-25T05:00:00.000Z (sorts as a string)."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def utcnow() -> datetime:
    return datetime.now(UTC)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80] or "job"


def make_job_id(raw: RawJob) -> str:
    return f"{slugify(f'{raw.title}-{raw.company}')}-{hashlib.sha1(raw.url.encode()).hexdigest()[:8]}"


# jobs


def upsert_job(session: Session, raw: RawJob, now: datetime) -> tuple[str, bool]:
    """Insert a new job, or refresh last_seen_at on one already stored. Jobs are never deleted by a scan."""
    row = session.scalar(select(JobRow).where(JobRow.url == raw.url))
    if row:
        row.last_seen_at = now
        session.commit()
        return row.id, False
    row = JobRow(
        id=make_job_id(raw),
        source=raw.source,
        source_id=raw.source_id,
        url=raw.url,
        title=raw.title,
        company=raw.company,
        location=raw.location,
        work_mode=raw.work_mode,
        posted_at=raw.posted_at,
        found_at=now,
        last_seen_at=now,
        seniority=raw.seniority,
        language=raw.language,
        text=raw.text,
        requirements=[r.model_dump() for r in raw.requirements],
        status="pending",
    )
    session.add(row)
    session.commit()
    return row.id, True


def job_row(session: Session, job_id: str) -> JobRow:
    row = session.get(JobRow, job_id)
    if row is None:
        raise KeyError(job_id)
    return row


def raw_of(row: JobRow) -> RawJob:
    return RawJob.model_validate(
        {
            "source": row.source,
            "source_id": row.source_id,
            "url": row.url,
            "title": row.title,
            "company": row.company,
            "location": row.location,
            "work_mode": row.work_mode,
            "posted_at": row.posted_at,
            "seniority": row.seniority,
            "text": row.text,
            "requirements": row.requirements,
            "language": row.language,
        }
    )


def pending_jobs(session: Session) -> list[JobRow]:
    return list(session.scalars(select(JobRow).where(JobRow.status == "pending").order_by(JobRow.found_at)))


def scored_jobs(session: Session) -> list[JobRow]:
    return list(session.scalars(select(JobRow).where(JobRow.status == "scored")))


def mark_scored(
    session: Session,
    job_id: str,
    *,
    city: str,
    work_mode: str,
    seniority: str,
    hidden_reason: str | None,
    content_hash: str | None = None,
) -> None:
    row = job_row(session, job_id)
    row.status = "scored"
    row.city, row.work_mode, row.seniority, row.hidden_reason = city, work_mode, seniority, hidden_reason
    if content_hash:
        row.content_hash = content_hash
    session.commit()


def delete_job(session: Session, job_id: str) -> None:
    """Only for jobs dropped before scoring (defense). Applied jobs are never deleted."""
    if session.scalar(select(ApplicationRow).where(ApplicationRow.job_id == job_id)):
        return
    session.delete(job_row(session, job_id))
    session.commit()


def _job(row: JobRow, score: ScoreRow) -> Job:
    return Job(
        id=row.id,
        title=row.title,
        company=row.company,
        city=row.city or row.location or "Israel",
        work_mode=cast(WorkMode, row.work_mode or "onsite"),
        url=row.url,
        posted_at=iso(row.posted_at or row.found_at),
        found_at=iso(row.found_at),
        seniority=row.seniority or "unlabeled",
        score=Score.model_validate({"total": score.total, "lines": score.lines}),
    )


def list_jobs(
    session: Session,
    since_found_at: datetime | None = None,
    min_score: int | None = None,
    include_hidden: bool = False,
    ids: list[str] | None = None,
) -> list[Job]:
    version = current_profile(session).version
    q = (
        select(JobRow, ScoreRow)
        .join(ScoreRow, (ScoreRow.job_id == JobRow.id) & (ScoreRow.profile_version == version))
        .where(JobRow.status == "scored")
        .order_by(ScoreRow.total.desc(), JobRow.found_at.desc())
    )
    if not include_hidden:
        q = q.where(JobRow.hidden_reason.is_(None))
    if since_found_at:
        q = q.where(JobRow.found_at >= since_found_at)
    if min_score is not None:
        q = q.where(ScoreRow.total >= min_score)
    if ids is not None:
        q = q.where(JobRow.id.in_(ids))
    return [_job(j, s) for j, s in session.execute(q).all()]


def get_job(session: Session, job_id: str) -> Job | None:
    jobs = list_jobs(session, include_hidden=True, ids=[job_id])
    return jobs[0] if jobs else None


# extraction cache and scores


def get_profile_cache(session: Session, content_hash: str) -> JobProfile | None:
    row = session.get(JobProfileRow, content_hash)
    return JobProfile.model_validate(row.data) if row else None


def put_profile_cache(session: Session, content_hash: str, model: str, jp: JobProfile) -> None:
    session.merge(JobProfileRow(content_hash=content_hash, model=model, data=jp.model_dump(mode="json")))
    session.commit()


def save_score(session: Session, job_id: str, version: int, score: Score) -> None:
    lines = [x.model_dump(mode="json", by_alias=True, exclude_none=True) for x in score.lines]
    session.merge(ScoreRow(job_id=job_id, profile_version=version, total=score.total, lines=lines))
    session.commit()


# profile


def current_profile(session: Session) -> Profile:
    row = session.scalar(select(ProfileRow).order_by(ProfileRow.version.desc()).limit(1))
    if row is None:
        return save_profile(session, load_seed())
    return Profile.model_validate({**row.data, "version": row.version})


def save_profile(session: Session, p: Profile) -> Profile:
    row = ProfileRow(data=p.model_dump(mode="json", exclude={"version"}))
    session.add(row)
    session.commit()
    return p.model_copy(update={"version": row.version})


# applications and events


def _app(row: ApplicationRow) -> Application:
    return Application(
        id=row.id,
        job_id=row.job_id,
        stage=cast(Stage, row.stage),
        history=[StageEntry.model_validate(h) for h in row.history],
        notes=row.notes,
        contact=row.contact,
        cv_version=row.cv_version,
    )


def list_applications(session: Session) -> list[Application]:
    return [_app(r) for r in session.scalars(select(ApplicationRow).order_by(ApplicationRow.id))]


def apply(session: Session, job_id: str) -> Application:
    existing = session.scalar(select(ApplicationRow).where(ApplicationRow.job_id == job_id))
    if existing:
        return _app(existing)
    job_row(session, job_id)
    at = iso(utcnow())
    row = ApplicationRow(id=f"app-{job_id}", job_id=job_id, stage="applied", history=[{"stage": "applied", "at": at}])
    session.add(row)
    record_event(session, "job.applied", {"jobId": job_id, "at": at}, commit=False)
    session.commit()
    return _app(row)


def update_application(
    session: Session,
    app_id: str,
    stage: Stage | None = None,
    notes: str | None = None,
    contact: str | None = None,
    cv_version: str | None = None,
) -> Application:
    row = session.get(ApplicationRow, app_id)
    if row is None:
        raise KeyError(app_id)
    if stage and stage != row.stage:
        at = iso(utcnow())
        row.history = [*row.history, {"stage": stage, "at": at}]
        record_event(session, "stage.changed", {"applicationId": app_id, "from": row.stage, "to": stage}, commit=False)
        row.stage = stage
    if notes is not None:
        row.notes = notes
    if contact is not None:
        row.contact = contact
    if cv_version is not None:
        row.cv_version = cv_version
    session.commit()
    return _app(row)


def record_event(session: Session, type_: str, payload: dict[str, Any], commit: bool = True) -> None:
    session.add(EventRow(type=type_, payload=payload))
    if commit:
        session.commit()


def list_events(session: Session) -> list[tuple[str, dict[str, Any]]]:
    return [(e.type, e.payload) for e in session.scalars(select(EventRow).order_by(EventRow.id))]


# runs


def start_run(session: Session, now: datetime) -> int:
    row = RunRow(started_at=now, summary=RunSummary(started_at=iso(now)).model_dump(mode="json", by_alias=True))
    session.add(row)
    session.commit()
    return row.id


def finish_run(session: Session, run_id: int, summary: RunSummary, now: datetime | None = None) -> RunSummary:
    row = session.get(RunRow, run_id)
    if row is None:
        raise KeyError(run_id)
    end = now or utcnow()
    done = summary.model_copy(update={"started_at": iso(row.started_at), "finished_at": iso(end)})
    row.finished_at = end
    row.summary = done.model_dump(mode="json", by_alias=True)
    session.commit()
    return done


def latest_run(session: Session) -> RunSummary | None:
    row = session.scalar(select(RunRow).order_by(RunRow.started_at.desc()).limit(1))
    return RunSummary.model_validate(row.summary) if row else None


def last_run_started(session: Session) -> datetime | None:
    return session.scalar(select(RunRow.started_at).order_by(RunRow.started_at.desc()).limit(1))


# ATS boards


def list_boards(session: Session) -> list[Board]:
    return [Board(company=b.company, provider=b.provider, token=b.token) for b in session.scalars(select(BoardRow))]


def add_board(session: Session, board: Board) -> bool:
    if session.get(BoardRow, (board.provider, board.token)):
        return False
    session.add(BoardRow(provider=board.provider, token=board.token, company=board.company, failures=0))
    session.commit()
    return True


def board_result(session: Session, board: Board, ok: bool, now: datetime) -> None:
    row = session.get(BoardRow, (board.provider, board.token))
    if row is None:
        return
    if ok:
        row.last_ok_at, row.failures = now, 0
    else:
        row.failures += 1
    session.commit()
