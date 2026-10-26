"""Finds a company's public job board, so the company set is discovered rather than hand-picked (spec §11b)."""

import re
from pathlib import Path
from typing import Any

import httpx
import yaml

from scouter.collectors import comeet, greenhouse, lever
from scouter.models import Board

_SUFFIX = re.compile(r"[-\s]+(internal|ltd|inc|llc|technologies|israel|group|co)\.?$", re.I)


def candidate_slugs(company: str) -> list[str]:
    name = company.strip().lower()
    while True:
        stripped = _SUFFIX.sub("", name).strip()
        if stripped == name:
            break
        name = stripped
    words = re.findall(r"[a-z0-9]+", name)
    if not words:
        return []
    out = ["".join(words), "-".join(words)]
    if len(words) > 2:
        # "check point software" -> also "checkpoint"; a lone first word would match strangers' boards
        out += ["".join(words[:2]), "-".join(words[:2])]
    return list(dict.fromkeys(out))


def _seed() -> dict[str, Any]:
    data: dict[str, Any] = yaml.safe_load((Path(__file__).parent / "boards.yaml").read_text())
    return data


def seed_boards() -> list[Board]:
    data = _seed()
    return [
        Board(company=e["company"], provider=p, token=e["token"])
        for p in ("greenhouse", "lever")
        for e in data.get(p) or []
    ]


def seed_comeet_pages() -> list[tuple[str, str]]:
    """(page "slug/uid", company) pairs whose token still has to be read from the careers page."""
    return [(e["page"], e["company"]) for e in _seed().get("comeet_pages") or []]


def resolve_comeet(client: httpx.Client, page: str, company: str) -> Board | None:
    slug, _, uid = page.partition("/")
    res = client.get(f"https://www.comeet.com/jobs/{slug}/{uid}")
    if res.status_code != 200:
        return None
    token = comeet.token_from_page(res.text)
    return Board(company=company, provider="comeet", token=f"{uid}:{token}") if token else None


def discover(client: httpx.Client, company: str) -> list[Board]:
    """Probe Greenhouse and Lever for the company. A board counts only when it lists at least one job."""
    found: list[Board] = []
    for provider, fetch in (("greenhouse", greenhouse.fetch), ("lever", lever.fetch)):
        for slug in candidate_slugs(company):
            try:
                if fetch(client, slug, company):
                    found.append(Board(company=company, provider=provider, token=slug))
                    break
            except (httpx.HTTPError, ValueError, KeyError):
                continue
    return found
