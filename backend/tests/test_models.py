import json
from pathlib import Path

from scouter.models import Job

FIXTURES = Path(__file__).resolve().parents[2] / "frontend/src/data/fixtures/jobs.json"


def test_job_serializes_camel_case() -> None:
    raw = json.loads(FIXTURES.read_text())[0]
    out = Job.model_validate(raw).model_dump(by_alias=True, exclude_none=True)
    assert {"workMode", "postedAt", "foundAt"} <= out.keys()
    trained = [j for j in json.loads(FIXTURES.read_text()) if any("trainGain" in x for x in j["score"]["lines"])][0]
    lines = Job.model_validate(trained).model_dump(by_alias=True, exclude_none=True)["score"]["lines"]
    assert any("trainGain" in line for line in lines)


def test_score_line_round_trips_frontend_fixture() -> None:
    for raw in json.loads(FIXTURES.read_text()):
        job = Job.model_validate(raw)
        assert job.model_dump(mode="json", by_alias=True, exclude_none=True) == raw
