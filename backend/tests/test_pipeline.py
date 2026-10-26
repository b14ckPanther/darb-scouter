from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy.orm import Session

from scouter import repo
from scouter.collectors.base import CollectorError
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
