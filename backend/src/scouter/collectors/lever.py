"""Lever public postings API."""

from datetime import UTC, datetime
from typing import Any

import httpx

from scouter.collectors.text import html_to_text
from scouter.models import RawJob

_MODES = {"onsite": "onsite", "on-site": "onsite", "hybrid": "hybrid", "remote": "remote"}


def parse(payload: list[dict[str, Any]], company: str) -> list[RawJob]:
    if not isinstance(payload, list):
        raise ValueError("Lever payload is not a list; the API may have changed")
    out = []
    for p in payload:
        lists = "\n".join(f"{x.get('text', '')}\n{html_to_text(x.get('content', ''))}" for x in p.get("lists", []))
        text = "\n".join(s for s in (p.get("descriptionPlain", ""), lists, p.get("additionalPlain", "")) if s).strip()
        created = p.get("createdAt")
        out.append(
            RawJob(
                source="lever",
                source_id=p["id"],
                url=p["hostedUrl"],
                title=p["text"].strip(),
                company=company,
                location=(p.get("categories") or {}).get("location"),
                work_mode=_MODES.get(str(p.get("workplaceType", "")).lower()),
                posted_at=datetime.fromtimestamp(created / 1000, UTC) if created else None,
                text=text,
            )
        )
    return out


def fetch(client: httpx.Client, token: str, company: str) -> list[RawJob]:
    res = client.get(f"https://api.lever.co/v0/postings/{token}", params={"mode": "json"})
    res.raise_for_status()
    return parse(res.json(), company)
