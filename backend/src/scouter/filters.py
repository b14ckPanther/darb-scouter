"""Which jobs Nour sees. Dropped jobs are never stored or scored; hidden ones are stored behind a toggle."""

import re
from pathlib import Path
from typing import Any, Literal

import yaml

from scouter.models import JobProfile, Profile, RawJob

Region = Literal["north", "center", "jerusalem", "south", "remote-il", "abroad", "unknown"]
HiddenReason = Literal["senior", "region", "student"]
DropReason = Literal["defense", "abroad"]

_RULES: dict[str, Any] = yaml.safe_load((Path(__file__).parent / "regions.yaml").read_text())
_REGIONS: list[tuple[Region, re.Pattern[str]]] = [(k, re.compile(v, re.I)) for k, v in _RULES["regions"].items()]
_ISRAEL = re.compile(_RULES["israel"], re.I)
_FOREIGN = re.compile(_RULES["foreign"], re.I)
_HIDDEN_REGIONS = set(_RULES["hidden_by_default"])
_LABELS: dict[str, str] = _RULES["labels"]


def region_of(location: str | None) -> Region:
    if not location or not location.strip():
        return "unknown"
    place = location.replace("-", " ")
    for region, pattern in _REGIONS:
        if pattern.search(place):
            return region
    # dropping a job is irreversible, so only a positive foreign signal counts as abroad
    if _FOREIGN.search(place):
        return "abroad"
    return "remote-il" if _ISRAEL.search(place) else "unknown"


def region_label(region: Region) -> str:
    return _LABELS[region]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9א-ת]+", " ", s.lower()).strip()


def is_excluded_company(company: str, profile: Profile) -> bool:
    name = f" {_norm(company)} "
    return any(f" {_norm(c)} " in name for c in profile.excluded_companies)


def drop_reason(raw: RawJob, jp: JobProfile, profile: Profile) -> DropReason | None:
    if is_excluded_company(raw.company, profile) or jp.is_defense:
        return "defense"
    if region_of(raw.location) == "abroad":
        return "abroad"
    return None


def hidden_reason(raw: RawJob, jp: JobProfile, profile: Profile) -> HiddenReason | None:
    if jp.study_years_left_required is not None and jp.study_years_left_required >= 1.5:
        return "student"
    if jp.seniority == "senior+" and not profile.show_senior:
        return "senior"
    if region_of(raw.location) in _HIDDEN_REGIONS and not profile.show_hidden_regions:
        return "region"
    return None
