"""Greenhouse public job board API."""

from datetime import datetime
from typing import Any

import httpx

from scouter.collectors.text import html_to_text
from scouter.models import RawJob


def parse(payload: dict[str, Any], company: str) -> list[RawJob]:
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise ValueError("Greenhouse payload has no 'jobs' list; the API may have changed")
    out = []
    for j in payload["jobs"]:
        out.append(
            RawJob(
                source="greenhouse",
                source_id=str(j["id"]),
                url=j["absolute_url"],
                title=j["title"].strip(),
                company=company,
                location=(j.get("location") or {}).get("name"),
                posted_at=datetime.fromisoformat(j["updated_at"]) if j.get("updated_at") else None,
                text=html_to_text(j.get("content") or ""),
            )
        )
    return out


def fetch(client: httpx.Client, token: str, company: str) -> list[RawJob]:
    res = client.get(f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs", params={"content": "true"})
    res.raise_for_status()
    return parse(res.json(), company)
