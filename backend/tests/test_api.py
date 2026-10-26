from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from scouter import repo
from scouter.api import Deps, create_app
from scouter.models import Job, RawJob, Score, ScoreLine
from scouter.search import SearchFilters

pytestmark = pytest.mark.db
NOW = datetime(2026, 10, 26, 5, 0, tzinfo=UTC)
JOB_KEYS = {
    "id",
    "title",
    "company",
    "city",
    "workMode",
    "url",
    "postedAt",
    "foundAt",
    "seniority",
    "score",
}


class DownIndexer:
    def index(self, job: Job, text: str) -> None: ...

    def search(self, q: str, f: SearchFilters, k: int = 50) -> list[str]:
        raise ConnectionError("es down")


def seed(session: Session, title: str = "Junior React Developer", total: int = 8000) -> str:
    raw = RawJob(
        source="t",
        source_id=title,
        url=f"https://x.example/{title}",
        title=title,
        company="Acme",
        location="Haifa",
        text="React",
    )
    job_id, _ = repo.upsert_job(session, raw, NOW)
    p = repo.current_profile(session)
    repo.save_score(
        session, job_id, p.version, Score(total=total, lines=[ScoreLine(kind="must", label="React", points=total)])
    )
    repo.mark_scored(session, job_id, city="Haifa", work_mode="onsite", seniority="junior", hidden_reason=None)
    return job_id


@pytest.fixture
def deps(session: Session) -> Deps:
    return Deps(session_factory=lambda: session, llm=None, indexer=DownIndexer(), http=lambda: httpx.Client())


@pytest.fixture
def client(deps: Deps) -> Iterator[TestClient]:
    with TestClient(create_app(deps)) as c:
        yield c


def test_jobs_shape_matches_frontend(client: TestClient, session: Session) -> None:
    seed(session)
    jobs = client.get("/api/jobs").json()
    assert set(jobs[0]) == JOB_KEYS and jobs[0]["score"]["lines"][0]["kind"] == "must"
    assert client.get(f"/api/jobs/{jobs[0]['id']}").json()["id"] == jobs[0]["id"]
    assert client.get("/api/jobs/nope").status_code == 404


def test_paste_linkedin_asks_for_text(client: TestClient) -> None:
    r = client.post("/api/jobs/paste", json={"url": "https://www.linkedin.com/jobs/view/1"})
    assert r.status_code == 422 and r.json()["needsText"] is True


def test_token_guard(deps: Deps, session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    deps.token = "s3cret"
    with TestClient(create_app(deps)) as c:
        assert c.get("/api/jobs").status_code == 401
        assert c.get("/api/jobs", headers={"X-Scouter-Token": "wrong"}).status_code == 401
        assert c.get("/api/jobs", headers={"X-Scouter-Token": "s3cret"}).status_code == 200
        assert c.get("/api/health").status_code == 200


def test_profile_put_rescores(client: TestClient) -> None:
    p = client.get("/api/profile").json()
    p["yearsExperience"] = 4
    r = client.put("/api/profile", json=p)
    assert r.status_code == 200 and r.json()["yearsExperience"] == 4 and r.json()["version"] > p["version"]


def test_second_scan_conflicts(deps: Deps) -> None:
    deps.llm = object()  # type: ignore[assignment]
    deps.collectors = lambda s: []
    assert deps.scan_lock.acquire(blocking=False)
    try:
        with TestClient(create_app(deps)) as c:
            assert c.post("/api/runs").status_code == 409
    finally:
        deps.scan_lock.release()


def test_search_falls_back_when_es_down(client: TestClient, session: Session) -> None:
    seed(session, "Junior React Developer")
    seed(session, "Data Analyst", 6000)
    r = client.get("/api/jobs/search", params={"q": "react"})
    assert r.headers.get("X-Search-Fallback") == "1" and [j["title"] for j in r.json()] == ["Junior React Developer"]


def test_applications_flow(client: TestClient, session: Session) -> None:
    job_id = seed(session)
    a = client.post("/api/applications", json={"jobId": job_id}).json()
    assert a["stage"] == "applied"
    b = client.patch(f"/api/applications/{a['id']}", json={"stage": "hr_call", "notes": "Sunday"}).json()
    assert b["stage"] == "hr_call" and b["notes"] == "Sunday"
    assert len(client.get("/api/applications").json()) == 1
    assert client.patch("/api/applications/none", json={"stage": "offer"}).status_code == 404


def test_latest_run_404_then_found(client: TestClient, session: Session) -> None:
    assert client.get("/api/runs/latest").status_code == 404
    run_id = repo.start_run(session, NOW)
    repo.finish_run(session, run_id, repo.RunSummary(startedAt=repo.iso(NOW), newJobs=2))
    assert client.get("/api/runs/latest").json()["newJobs"] == 2
