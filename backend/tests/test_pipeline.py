from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from scouter import repo
from scouter.collectors.base import CollectorError
from scouter.db import RunRow
from scouter.extract.llm import DraftItem, ExtractionError, LLMDraft
from scouter.models import Job, RawJob, Requirement, RunSummary
from scouter.pipeline import rescore_all, run_scan

pytestmark = pytest.mark.db
NOW = datetime(2026, 10, 26, 5, 0, tzinfo=UTC)


def raw(n: int, company: str = "Acme", text: str = "Requirements: Python and React") -> RawJob:
    return RawJob(
        source="fake",
        source_id=str(n),
        url=f"https://jobs.example/{n}",
        title=f"Junior Dev {n}",
        company=company,
        location="Haifa, Israel",
        seniority="junior",
        text=text,
    )


class Fake:
    def __init__(self, name: str, jobs: list[RawJob] | None = None, fail: bool = False) -> None:
        self.name, self.jobs, self.fail = name, jobs or [], fail

    def collect(self, client: httpx.Client) -> list[RawJob]:
        if self.fail:
            raise CollectorError("page format changed")
        return self.jobs


class FakeLLM:
    def __init__(self, down: bool = False, defense: bool = False) -> None:
        self.calls, self.down, self.defense = 0, down, defense

    def extract(self, text: str, requirements: list[Requirement], model: str) -> LLMDraft:
        self.calls += 1
        if self.down:
            raise ExtractionError("APIConnectionError")
        q = "Python and React"
        return LLMDraft(
            must_have=[DraftItem(skill_phrases=["Python", "React"], quote=q, display=q)],
            seniority="junior",
            is_defense=self.defense,
            defense_quote=q if self.defense else None,
        )


def scan(session: Session, collectors: list[Fake], llm: FakeLLM, now: datetime = NOW, **kw: object) -> RunSummary:
    with httpx.Client() as c:
        return run_scan(session, collectors, llm, None, now, client=c, model="m", **kw)  # type: ignore[arg-type]


def test_one_collector_failing_others_still_run(session: Session) -> None:
    s = scan(session, [Fake("broken", fail=True), Fake("ok", [raw(1), raw(2)])], FakeLLM())
    assert s.per_source["broken"].failed and "format changed" in (s.per_source["broken"].error or "")
    assert s.per_source["ok"].found == 2 and s.per_source["ok"].new == 2 and s.new_jobs == 2
    assert len(repo.list_jobs(session)) == 2


def test_defense_job_dropped_and_counted(session: Session) -> None:
    s = scan(session, [Fake("ok", [raw(1, company="Elbit Systems"), raw(2)])], FakeLLM())
    assert s.dropped.get("defense") == 1 and len(repo.list_jobs(session, include_hidden=True)) == 1
    s2 = scan(
        session,
        [Fake("ok", [raw(3, text="Python and React for IDF projects")])],
        FakeLLM(defense=True),
        NOW + timedelta(days=1),
    )
    assert s2.dropped.get("defense") == 1 and repo.get_job(session, repo.make_job_id(raw(3, text="x"))) is None


def test_llm_down_leaves_job_pending_then_scores_next_run(session: Session) -> None:
    s = scan(session, [Fake("ok", [raw(1)])], FakeLLM(down=True))
    assert s.pending == 1 and repo.list_jobs(session) == []
    s2 = scan(session, [Fake("ok", [raw(1)])], FakeLLM(), NOW + timedelta(days=1))
    assert s2.pending == 0 and len(repo.list_jobs(session)) == 1


def test_cached_profile_not_re_extracted(session: Session) -> None:
    llm = FakeLLM()
    scan(session, [Fake("ok", [raw(1)])], llm)
    scan(session, [Fake("ok", [raw(1)])], llm, NOW + timedelta(days=1))
    assert llm.calls == 1


def test_job_gone_from_source_survives(session: Session) -> None:
    scan(session, [Fake("ok", [raw(1)])], FakeLLM())
    job_id = repo.make_job_id(raw(1))
    repo.apply(session, job_id)
    scan(session, [Fake("ok", [])], FakeLLM(), NOW + timedelta(days=1))
    assert repo.get_job(session, job_id) is not None and len(repo.list_applications(session)) == 1


def test_alert_failure_does_not_fail_run(session: Session) -> None:
    def alert(summary: RunSummary, matches: list[Job]) -> int:
        raise RuntimeError("telegram down")

    s = scan(session, [Fake("ok", [raw(1)])], FakeLLM(), alert=alert)
    assert s.alerts_failed == 1 and s.finished_at and repo.latest_run(session) == s


def test_rescore_after_profile_change(session: Session) -> None:
    llm = FakeLLM()
    scan(session, [Fake("ok", [raw(1)])], llm)
    before = repo.list_jobs(session)[0].score.total
    p = repo.current_profile(session)
    repo.save_profile(session, p.model_copy(update={"skills": {**p.skills, "python": "proven"}}))
    assert rescore_all(session) == 1
    assert repo.list_jobs(session)[0].score.total > before and llm.calls == 1


def test_abroad_dropped_before_extraction(session: Session) -> None:
    llm = FakeLLM()
    far = raw(9).model_copy(update={"location": "Chicago, IL, United States"})
    s = scan(session, [Fake("ok", [far])], llm)
    assert s.dropped.get("abroad") == 1 and llm.calls == 0


def test_alert_threshold_comes_from_profile(session: Session) -> None:
    p = repo.current_profile(session)
    repo.save_profile(session, p.model_copy(update={"alert_threshold": 5000}))
    seen: list[list[Job]] = []
    scan(session, [Fake("ok", [raw(1)])], FakeLLM(), alert=lambda s, m: seen.append(m) or 0)
    assert len(seen[0]) == 1 and seen[0][0].score.total > 5000


class PartlyBroken(Fake):
    failures = ["lever:odd: TypeError"]


def test_partial_board_failures_are_reported(session: Session) -> None:
    s = scan(session, [PartlyBroken("ats", [raw(1)])], FakeLLM())
    assert s.per_source["ats"].error and "lever:odd" in (s.per_source["ats"].error or "")


def test_crash_is_recorded_on_the_run(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: object, **k: object) -> None:
        raise RuntimeError("database went away: boom")

    monkeypatch.setattr(repo, "upsert_job", boom)
    with pytest.raises(RuntimeError):
        scan(session, [Fake("ok", [raw(1)])], FakeLLM())
    row = session.scalar(select(RunRow).order_by(RunRow.id.desc()).limit(1))
    assert row is not None and row.error and "boom" in row.error and row.finished_at


def test_job_that_keeps_failing_is_parked(session: Session) -> None:
    llm = FakeLLM(down=True)
    for day in range(4):
        scan(session, [Fake("ok", [raw(1)])], llm, NOW + timedelta(days=day))
    assert llm.calls == 3  # parked after 3 failed attempts, never re-billed
    assert repo.job_row(session, repo.make_job_id(raw(1))).status == "parked"


def test_extraction_stops_after_consecutive_outages(session: Session) -> None:
    llm = FakeLLM(down=True)
    s = scan(session, [Fake("ok", [raw(i) for i in range(10)])], llm)
    assert llm.calls == 3 and s.pending == 10


def test_index_gets_the_source_and_rescore_reindexes(session: Session) -> None:
    calls: list[tuple[str, str]] = []

    class Idx:
        def index(self, job: Job, text: str, source: str = "") -> None:
            calls.append((job.id, source))

    with httpx.Client() as c:
        run_scan(session, [Fake("ok", [raw(1)])], FakeLLM(), Idx(), NOW, client=c, model="m")  # type: ignore[arg-type]
    assert calls and calls[0][1] == "fake"
    calls.clear()
    rescore_all(session, Idx())  # type: ignore[arg-type]
    assert calls and calls[0][1] == "fake"


def test_rescore_drops_a_newly_excluded_company(session: Session) -> None:
    scan(session, [Fake("ok", [raw(1, company="Acme Arms")])], FakeLLM())
    assert len(repo.list_jobs(session)) == 1
    p = repo.current_profile(session)
    repo.save_profile(session, p.model_copy(update={"excluded_companies": [*p.excluded_companies, "Acme Arms"]}))
    rescore_all(session)
    assert repo.list_jobs(session, include_hidden=True) == []
