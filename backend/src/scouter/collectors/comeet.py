"""Comeet careers API. Companies embed a public UID and token in their own careers pages."""

import re
from datetime import datetime
from typing import Any

import httpx

from scouter.collectors.text import html_to_text
from scouter.models import RawJob

_MODES = {"on-site": "onsite", "onsite": "onsite", "hybrid": "hybrid", "remote": "remote"}
_TOKEN = re.compile(r'"token"\s*:\s*"([0-9A-F]{16,})"', re.I)
_JUNIOR = re.compile(r"entry|junior|intern|student|graduate", re.I)


def token_from_page(html: str) -> str | None:
    m = _TOKEN.search(html)
    return m.group(1) if m else None


def parse(payload: list[dict[str, Any]], company: str) -> list[RawJob]:
    out = []
    for p in payload:
        loc = p.get("location") or {}
        details = "\n".join(f"{d.get('name', '')}\n{html_to_text(d.get('value') or '')}" for d in p.get("details", []))
        level = p.get("experience_level") or ""
        out.append(
            RawJob(
                source="comeet",
                source_id=p["uid"],
                url=p.get("url_active_page") or p.get("url_comeet_hosted_page") or "",
                title=p["name"].strip(),
                company=company,
                location=loc.get("city") or loc.get("name"),
                work_mode=_MODES.get(str(p.get("workplace_type", "")).lower()),
                posted_at=datetime.fromisoformat(p["time_updated"]) if p.get("time_updated") else None,
                seniority="junior" if _JUNIOR.search(level) else (level.lower() or None),
                text=details.strip(),
            )
        )
    return [j for j in out if j.url]


def fetch(client: httpx.Client, token: str, company: str) -> list[RawJob]:
    """`token` is stored as "<company uid>:<api token>"."""
    uid, _, api_token = token.partition(":")
    res = client.get(
        f"https://www.comeet.co/careers-api/2.0/company/{uid}/positions",
        params={"token": api_token, "details": "true"},
    )
    res.raise_for_status()
    return parse(res.json(), company)
