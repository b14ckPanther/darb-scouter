"""FreeHire (freehire.me): Israeli listings embedded in each role page as JS object literals."""

import json
import re
from datetime import datetime

import httpx

from scouter.collectors.base import CollectorError
from scouter.models import RawJob, Requirement

_REQ = re.compile(r'\{text:"((?:[^"\\]|\\.)*)",priority:"(\w+)"')
_MODES = {"onsite": "onsite", "on_site": "onsite", "hybrid": "hybrid", "remote": "remote"}


def _field(chunk: str, name: str) -> str | None:
    m = re.search(rf'\b{name}:"((?:[^"\\]|\\.)*)"', chunk)
    return json.loads(f'"{m.group(1)}"') if m else None


def _date(s: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    except ValueError:
        return None


def parse_page(html: str, role: str) -> list[RawJob]:
    jobs: dict[str, RawJob] = {}
    for chunk in re.split(r'(?=\{public_slug:")', html):
        slug = _field(chunk, "public_slug")
        title, company, url = _field(chunk, "title"), _field(chunk, "company"), _field(chunk, "url")
        if not slug or not title or not company or not url or slug in jobs:
            continue
        reqs = []
        for text, priority in _REQ.findall(chunk):
            reqs.append(
                Requirement(
                    text=json.loads(f'"{text}"'),
                    priority="required" if priority == "required" else "preferred",
                )
            )
        mode = re.search(r'work_mode:"(\w+)"', chunk)
        summary = _field(chunk, "summary") or ""
        jobs[slug] = RawJob(
            source="freehire",
            source_id=slug,
            url=url,
            title=title.strip(),
            company=company.strip(),
            location=_field(chunk, "location"),
            work_mode=_MODES.get(mode.group(1)) if mode else None,
            posted_at=_date(_field(chunk, "posted_at")),
            seniority=_field(chunk, "seniority"),
            text="\n".join([*(r.text for r in reqs), summary]).strip(),
            requirements=reqs,
        )
    return list(jobs.values())


class FreeHireCollector:
    name = "freehire"

    def __init__(self, roles: tuple[str, ...] = ("fullstack", "backend", "frontend"), max_pages: int = 10) -> None:
        self.roles = roles
        self.max_pages = max_pages
        self.last: list[RawJob] = []

    def collect(self, client: httpx.Client) -> list[RawJob]:
        out: dict[str, RawJob] = {}
        for role in self.roles:
            for page in range(1, self.max_pages + 1):
                res = client.get(f"https://freehire.me/roles/{role}/israel", params={"page": page})
                if res.status_code == 404 and page > 1:
                    break
                res.raise_for_status()
                jobs = parse_page(res.text, role)
                if not jobs:
                    if page == 1:
                        # a 200 with nothing to parse means the page format changed: say so loudly
                        raise CollectorError(
                            f"FreeHire {role} page 1 returned no jobs; the page format may have changed"
                        )
                    break
                for j in jobs:
                    out.setdefault(j.source_id, j)
        self.last = list(out.values())
        return self.last
