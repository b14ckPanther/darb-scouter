"""Removes the same job seen twice: same link, or the same role at the same company on two sources."""

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from rapidfuzz import fuzz

from scouter.models import RawJob

_SENIORITY = re.compile(r"\b(junior|jr|senior|sr|intern|student|entry level|graduate|mid level)\b")
_COMPANY_SUFFIX = re.compile(r"\b(ltd|inc|llc|technologies|israel|internal)\b")
TITLE_MATCH = 90
TEXT_MATCH = 80


def canonical_url(url: str) -> str:
    """Lowercased host, no fragment, no trailing slash, tracking parameters removed."""
    p = urlparse(url.strip())
    query = urlencode([(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith("utm_")])
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", "", query, ""))


def norm_company(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return re.sub(r"\s+", " ", _COMPANY_SUFFIX.sub(" ", s)).strip()


def norm_title(s: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", s.lower())
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", _SENIORITY.sub(" ", s)).strip()


def same_role(a: RawJob, b: RawJob) -> bool:
    return (
        norm_company(a.company) == norm_company(b.company)
        and fuzz.token_set_ratio(norm_title(a.title), norm_title(b.title)) >= TITLE_MATCH
        and fuzz.token_set_ratio(a.text[:2000], b.text[:2000]) >= TEXT_MATCH
    )


def _merge(keep: RawJob, other: RawJob) -> RawJob:
    """Prefer the ATS post (it carries the full text); keep FreeHire's structured requirement lines."""
    if keep.source == "freehire" and other.source != "freehire":
        keep, other = other, keep
    if not keep.requirements and other.requirements:
        keep = keep.model_copy(update={"requirements": other.requirements})
    return keep


def dedupe(jobs: list[RawJob]) -> list[RawJob]:
    by_url: dict[str, RawJob] = {}
    for j in jobs:
        key = canonical_url(j.url)
        by_url[key] = _merge(by_url[key], j) if key in by_url else j
    out: list[RawJob] = []
    for j in by_url.values():
        for i, kept in enumerate(out):
            if same_role(kept, j):
                out[i] = _merge(kept, j)
                break
        else:
            out.append(j)
    return out
