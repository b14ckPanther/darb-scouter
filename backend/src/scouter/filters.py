"""Which jobs Nour sees. Dropped jobs are never stored or scored; hidden ones are stored behind a toggle."""

import re
from typing import Literal

from scouter.models import JobProfile, Profile, RawJob

Region = Literal["north", "center", "jerusalem", "south", "remote-il", "abroad", "unknown"]
HiddenReason = Literal["senior", "region", "student"]
DropReason = Literal["defense", "abroad"]

_REGIONS: list[tuple[Region, re.Pattern[str]]] = [
    (
        "north",
        re.compile(
            r"haifa|yokne|nazareth|nazrat|akko|acre|karmiel|carmiel|nahariya|afula|tiberias|safed|zefat|caesarea"
            r"|hadera|zichron|zikhron|galilee|migdal ha|tirat carmel|חיפה|יקנעם|נצרת|עכו|כרמיאל|נהריה|עפולה|טבריה"
            r"|צפת|קיסריה|חדרה|זכרון|גליל",
            re.I,
        ),
    ),
    (
        "center",
        re.compile(
            r"tel aviv|herzli|ramat gan|petah|petach|ra'?anana|kfar saba|netanya|holon|bnei brak|rishon|rehovot"
            r"|ness ziona|nes ziona|yavne|hod hasharon|givatayim|rosh ha'?ayin|\blod\b|ramla|modi'?in|or yehuda"
            r"|airport city|kfar monash|תל אביב|הרצליה|רמת גן|פתח תקווה|רעננה|כפר סבא|נתניה|חולון|בני ברק"
            r"|ראשון לציון|רחובות|נס ציונה|יבנה|הוד השרון|גבעתיים|ראש העין|לוד|רמלה|מודיעין|אור יהודה",
            re.I,
        ),
    ),
    ("jerusalem", re.compile(r"jerusalem|ירושלים|beit shemesh|בית שמש", re.I)),
    (
        "south",
        re.compile(r"be'?er ?sheva|beersheba|ashdod|ashkelon|kiryat gat|eilat|dimona|באר שבע|אשדוד|אשקלון|אילת", re.I),
    ),
]
_ISRAEL = re.compile(r"israel|ישראל", re.I)
_HIDDEN_REGIONS = {"jerusalem", "south"}
_LABELS = {
    "north": "North: in your region",
    "center": "Center: in your region",
    "remote-il": "Remote in Israel: in your region",
    "jerusalem": "Jerusalem: outside your region",
    "south": "South: outside your region",
    "unknown": "Location not stated",
    "abroad": "Abroad",
}


def region_of(location: str | None) -> Region:
    if not location or not location.strip():
        return "unknown"
    for region, pattern in _REGIONS:
        if pattern.search(location):
            return region
    if _ISRAEL.search(location):
        return "remote-il"
    return "abroad"


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
