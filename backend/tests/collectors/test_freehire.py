from pathlib import Path

import httpx
import pytest
import respx

from scouter.collectors.base import CollectorError
from scouter.collectors.freehire import FreeHireCollector, parse_page
from scouter.http import polite_client

FIX = Path(__file__).resolve().parents[1] / "fixtures"
PAGE = (FIX / "freehire_fullstack_p1.html").read_text()
BASE = "https://freehire.me/roles/fullstack/israel"


def test_parses_saved_page() -> None:
    jobs = parse_page(PAGE, "fullstack")
    assert len(jobs) >= 10
    for j in jobs:
        assert j.title and j.company and j.url.startswith("http")
        assert j.requirements and {r.priority for r in j.requirements} <= {"required", "preferred"}
        assert j.source == "freehire"


def test_unchanged_slug_is_source_id() -> None:
    jobs = parse_page(PAGE, "fullstack")
    assert all(j.source_id and " " not in j.source_id for j in jobs)
    assert len({j.source_id for j in jobs}) == len(jobs)


@respx.mock
def test_format_change_fails_loudly() -> None:
    respx.get(f"{BASE}?page=1").mock(return_value=httpx.Response(200, text=(FIX / "freehire_changed.html").read_text()))
    with polite_client(min_interval=0) as c, pytest.raises(CollectorError, match="no jobs"):
        FreeHireCollector(roles=("fullstack",)).collect(c)


@respx.mock
def test_stops_after_empty_page() -> None:
    respx.get(f"{BASE}?page=1").mock(return_value=httpx.Response(200, text=PAGE))
    p2 = respx.get(f"{BASE}?page=2").mock(return_value=httpx.Response(200, text="<html></html>"))
    p3 = respx.get(f"{BASE}?page=3").mock(return_value=httpx.Response(200, text=PAGE))
    with polite_client(min_interval=0) as c:
        jobs = FreeHireCollector(roles=("fullstack",)).collect(c)
    assert jobs and p2.called and not p3.called


@respx.mock
def test_sends_identifying_user_agent() -> None:
    route = respx.get(f"{BASE}?page=1").mock(return_value=httpx.Response(200, text=PAGE))
    respx.get(f"{BASE}?page=2").mock(return_value=httpx.Response(200, text=""))
    with polite_client(min_interval=0) as c:
        FreeHireCollector(roles=("fullstack",)).collect(c)
    assert "darb-scouter/0.1" in route.calls[0].request.headers["user-agent"]
