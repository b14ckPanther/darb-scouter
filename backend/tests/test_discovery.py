import json
from pathlib import Path

import httpx
import respx

from scouter.discovery import candidate_slugs, discover, seed_boards
from scouter.http import polite_client

FIX = Path(__file__).resolve().parent / "fixtures"


def test_candidate_slugs() -> None:
    s = candidate_slugs("Check Point Software Ltd")
    assert "checkpointsoftware" in s and "check-point-software" in s and "checkpoint" in s
    assert candidate_slugs("Varonis-internal")[0] == "varonis"


@respx.mock
def test_discover_greenhouse_hit() -> None:
    respx.get(url__startswith="https://boards-api.greenhouse.io/v1/boards/acme/jobs").mock(
        return_value=httpx.Response(200, json=json.loads((FIX / "greenhouse_jobs.json").read_text()))
    )
    respx.get(url__startswith="https://boards-api.greenhouse.io/").mock(return_value=httpx.Response(404))
    respx.get(url__startswith="https://api.lever.co/").mock(return_value=httpx.Response(404))
    with polite_client(min_interval=0) as c:
        boards = discover(c, "Acme")
    assert [(b.provider, b.token) for b in boards] == [("greenhouse", "acme")]


@respx.mock
def test_empty_board_is_not_a_hit() -> None:
    respx.get(url__startswith="https://boards-api.greenhouse.io/").mock(
        return_value=httpx.Response(200, json={"jobs": []})
    )
    respx.get(url__startswith="https://api.lever.co/").mock(return_value=httpx.Response(200, json=[]))
    with polite_client(min_interval=0) as c:
        assert discover(c, "Acme") == []


def test_seed_boards_load() -> None:
    boards = seed_boards()
    assert any(b.provider == "greenhouse" for b in boards) and any(b.provider == "lever" for b in boards)
