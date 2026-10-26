from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from scouter import repo
from scouter.models import RawJob, Score, ScoreLine

pytestmark = pytest.mark.db
NOW = datetime(2026, 10, 26, 5, 0, tzinfo=UTC)


def raw(url: str = "https://jobs.example/1", title: str = "Junior Developer") -> RawJob:
    return RawJob(
        source="freehire", source_id="s1", url=url, title=title, company="Wix", location="Haifa", text="React"
    )


def scored(session: Session, url: str, total: int, hidden: str | None = None) -> str:
    job_id, _ = repo.upsert_job(session, raw(url), NOW)
    p = repo.current_profile(session)
    repo.save_score(
        session, job_id, p.version, Score(total=total, lines=[ScoreLine(kind="must", label="x", points=total)])
    )
    repo.mark_scored(session, job_id, city="Haifa", work_mode="onsite", seniority="junior", hidden_reason=hidden)
    return job_id


def test_upsert_is_idempotent_by_url(session: Session) -> None:
    a, new_a = repo.upsert_job(session, raw(), NOW)
    b, new_b = repo.upsert_job(session, raw(title="Junior Developer (renamed)"), NOW)
    assert a == b and new_a and not new_b


def test_seen_again_refreshes_last_seen_not_found_at(session: Session) -> None:
    job_id, _ = repo.upsert_job(session, raw(), NOW)
    repo.upsert_job(session, raw(), NOW + timedelta(days=1))
    row = repo.job_row(session, job_id)
    assert row.found_at == NOW and row.last_seen_at == NOW + timedelta(days=1)


def test_apply_twice_returns_same_application(session: Session) -> None:
    job_id = scored(session, "https://jobs.example/a", 8000)
    a = repo.apply(session, job_id)
    assert repo.apply(session, job_id).id == a.id
    assert len(repo.list_applications(session)) == 1


def test_stage_change_appends_history_and_event(session: Session) -> None:
    job_id = scored(session, "https://jobs.example/b", 8000)
    a = repo.apply(session, job_id)
    b = repo.update_application(session, a.id, stage="hr_call", notes="call Sunday")
    assert [h.stage for h in b.history] == ["applied", "hr_call"] and b.notes == "call Sunday"
    assert [e for e, _ in repo.list_events(session)] == ["job.applied", "stage.changed"]


def test_profile_save_bumps_version(session: Session) -> None:
    p = repo.current_profile(session)
    q = repo.save_profile(session, p.model_copy(update={"years_experience": 3}))
    assert q.version == p.version + 1 and repo.current_profile(session).years_experience == 3


def test_list_jobs_hides_hidden_unless_asked(session: Session) -> None:
    scored(session, "https://jobs.example/c", 7000)
    scored(session, "https://jobs.example/d", 9500, hidden="senior")
    assert [j.score.total for j in repo.list_jobs(session)] == [7000]
    assert [j.score.total for j in repo.list_jobs(session, include_hidden=True)] == [9500, 7000]
    assert repo.list_jobs(session, min_score=8000) == []


def test_run_round_trip(session: Session) -> None:
    run_id = repo.start_run(session, NOW)
    repo.finish_run(session, run_id, repo.RunSummary(startedAt=NOW.isoformat(), newJobs=3, topScore=8742))
    latest = repo.latest_run(session)
    assert latest and latest.new_jobs == 3 and latest.top_score == 8742 and latest.finished_at
