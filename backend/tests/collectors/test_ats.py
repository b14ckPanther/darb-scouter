import json
from pathlib import Path

import httpx
import pytest
import respx

from scouter.collectors import comeet, greenhouse, lever
from scouter.collectors.ats import ATSCollector
from scouter.collectors.base import CollectorError
from scouter.http import polite_client
from scouter.models import Board

FIX = Path(__file__).resolve().parents[1] / "fixtures"


def load(name: str) -> object:
    return json.loads((FIX / name).read_text())


def test_greenhouse_parse() -> None:
    jobs = greenhouse.parse(load("greenhouse_jobs.json"), "Acme")  # type: ignore[arg-type]
    assert [j.title for j in jobs] == ["Junior Backend Engineer", "Frontend Developer"]
    assert jobs[0].location == "Tel Aviv, Israel" and jobs[0].url.endswith("/4012345")
    assert "1+ years with Python or Go" in jobs[0].text and "<" not in jobs[0].text


def test_lever_parse() -> None:
    j = lever.parse(load("lever_postings.json"), "Acme")[0]  # type: ignore[arg-type]
    assert j.title == "Junior Full Stack Developer" and j.work_mode == "hybrid" and j.location == "Herzliya, Israel"
    assert "Node.js" in j.text and "AWS" in j.text and j.posted_at is not None


def test_comeet_parse() -> None:
    j = comeet.parse(load("comeet_positions.json"), "Acme")[0]  # type: ignore[arg-type]
    assert j.title == "Junior Software Engineer" and j.location == "Yokneam, IL" and j.work_mode == "hybrid"
    assert "C++ or Python" in j.text and j.seniority == "junior"


def test_comeet_token_from_careers_page() -> None:
    assert comeet.token_from_page((FIX / "comeet_careers.html").read_text()) == "ABCDEF1234567890ABCDEF1234567890"


@respx.mock
def test_one_board_failing_does_not_fail_collector() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/good/jobs").mock(
        return_value=httpx.Response(200, json=load("greenhouse_jobs.json"))
    )
    respx.get("https://boards-api.greenhouse.io/v1/boards/gone/jobs").mock(return_value=httpx.Response(404))
    col = ATSCollector(
        [
            Board(company="Good", provider="greenhouse", token="good"),
            Board(company="Gone", provider="greenhouse", token="gone"),
        ]
    )
    with polite_client(min_interval=0) as c:
        jobs = col.collect(c)
    assert len(jobs) == 2 and col.results == {"greenhouse:good": True, "greenhouse:gone": False}


@respx.mock
def test_all_boards_failing_raises() -> None:
    respx.get("https://api.lever.co/v0/postings/x").mock(return_value=httpx.Response(500))
    with polite_client(min_interval=0) as c, pytest.raises(CollectorError):
        ATSCollector([Board(company="X", provider="lever", token="x")]).collect(c)


def test_comeet_keeps_country_so_unlisted_israeli_towns_survive() -> None:
    j = comeet.parse(load("comeet_positions.json"), "Acme")[0]  # type: ignore[arg-type]
    assert j.location is not None and "IL" in j.location


@respx.mock
def test_renamed_payload_key_is_a_failure_not_zero_jobs() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/acme/jobs").mock(
        return_value=httpx.Response(200, json={"postings": []})
    )
    with polite_client(min_interval=0) as c, pytest.raises(CollectorError):
        ATSCollector([Board(company="Acme", provider="greenhouse", token="acme")]).collect(c)


@respx.mock
def test_unexpected_shape_fails_one_board_only() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/good/jobs").mock(
        return_value=httpx.Response(200, json=load("greenhouse_jobs.json"))
    )
    respx.get("https://api.lever.co/v0/postings/odd").mock(return_value=httpx.Response(200, json={"not": "a list"}))
    col = ATSCollector(
        [
            Board(company="Good", provider="greenhouse", token="good"),
            Board(company="Odd", provider="lever", token="odd"),
        ]
    )
    with polite_client(min_interval=0) as c:
        assert len(col.collect(c)) == 2
    assert col.results == {"greenhouse:good": True, "lever:odd": False}
    assert col.failures and "lever:odd" in col.failures[0]
