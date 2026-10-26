import pytest

from scouter.filters import drop_reason, hidden_reason, is_excluded_company, region_label, region_of
from scouter.models import JobProfile, RawJob
from scouter.profile import load_seed


def raw(location: str | None = "Haifa, Israel", company: str = "Wix", seniority: str | None = "junior") -> RawJob:
    return RawJob(
        source="t",
        source_id="1",
        url="u",
        title="Dev",
        company=company,
        location=location,
        seniority=seniority,
        text="",
    )


@pytest.mark.parametrize(
    ("loc", "want"),
    [
        ("Haifa, Israel", "north"),
        ("Yokneam Illit", "north"),
        ("Akko", "north"),
        ("חיפה", "north"),
        ("Tel Aviv-Yafo, Israel", "center"),
        ("Petah Tikva", "center"),
        ("Rishon LeZion", "center"),
        ("Jerusalem, Israel", "jerusalem"),
        ("ירושלים", "jerusalem"),
        ("Be'er Sheva", "south"),
        ("Israel", "remote-il"),
        ("New York, NY, United States", "abroad"),
        (None, "unknown"),
    ],
)
def test_region_of(loc: str | None, want: str) -> None:
    assert region_of(loc) == want


def test_region_label() -> None:
    assert region_label("north") == "North: in your region"
    assert region_label("center") == "Center: in your region"


def test_jerusalem_hidden_by_default_shown_with_toggle() -> None:
    p = load_seed()
    assert hidden_reason(raw("Jerusalem"), JobProfile(), p) == "region"
    assert hidden_reason(raw("Jerusalem"), JobProfile(), p.model_copy(update={"show_hidden_regions": True})) is None


def test_defense_dropped_by_list_and_by_flag() -> None:
    p = load_seed()
    assert is_excluded_company("Elbit Systems-internal", p)
    assert drop_reason(raw(company="Elbit Systems"), JobProfile(), p) == "defense"
    assert drop_reason(raw(company="Acme"), JobProfile(is_defense=True), p) == "defense"
    assert drop_reason(raw(company="Acme"), JobProfile(), p) is None
    assert drop_reason(raw("Chicago, IL, United States"), JobProfile(), p) == "abroad"


def test_student_needing_two_years_hidden() -> None:
    p = load_seed()
    assert hidden_reason(raw(), JobProfile(study_years_left_required=2), p) == "student"
    assert hidden_reason(raw(), JobProfile(study_years_left_required=1), p) is None


def test_senior_hidden_not_dropped() -> None:
    p = load_seed()
    assert hidden_reason(raw(), JobProfile(seniority="senior+"), p) == "senior"
    assert drop_reason(raw(), JobProfile(seniority="senior+"), p) is None
    assert hidden_reason(raw(), JobProfile(seniority="senior+"), p.model_copy(update={"show_senior": True})) is None


@pytest.mark.parametrize(
    "loc",
    [
        "Tel-Aviv",
        "Bnei-Brak",
        "Kfar-Saba",
        "תל-אביב",
        "Kiryat Tivon",
        "Rosh Pina",
        "Remote",
        "Hybrid",
        "TLV",
        "Somewhere new",
    ],
)
def test_unknown_israeli_places_are_never_dropped_as_abroad(loc: str) -> None:
    assert region_of(loc) != "abroad"
    assert drop_reason(raw(loc), JobProfile(), load_seed()) is None


def test_hyphens_match_known_cities() -> None:
    assert region_of("Tel-Aviv") == "center" and region_of("Kfar-Saba") == "center"


def test_only_a_positive_foreign_signal_drops() -> None:
    assert region_of("Berlin, Germany") == "abroad"
    assert region_of("London, UK") == "abroad"
    assert region_of("New York, NY, United States") == "abroad"


def test_exclusion_list_comes_from_config_not_the_stored_profile() -> None:
    from scouter.filters import excluded_companies

    stored = load_seed().model_copy(update={"excluded_companies": []})  # e.g. an old profile, or a PUT that omitted it
    assert "Elbit" in excluded_companies(stored)
    assert drop_reason(raw(company="Elbit Systems"), JobProfile(), stored) == "defense"


def test_user_additions_are_kept_alongside_config() -> None:
    from scouter.filters import excluded_companies

    p = load_seed().model_copy(update={"excluded_companies": ["Some Defense Co"]})
    assert {"Elbit", "Some Defense Co"} <= set(excluded_companies(p))
