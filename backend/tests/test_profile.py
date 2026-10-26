import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from scouter.models import Profile
from scouter.profile import load_seed

SCORER = Path(__file__).resolve().parents[2] / "frontend/scripts/build-fixtures.mjs"


def _fixture_skills() -> dict[str, str]:
    block = re.search(r"skills: \{(.*?)\n  \}", SCORER.read_text(), re.S)
    assert block
    return {k.strip("'"): v for k, v in re.findall(r"([\w'-]+): '(\w+)'", block.group(1))}


def test_seed_matches_fixture_profile() -> None:
    p = load_seed()
    assert p.skills == _fixture_skills()
    assert p.years_experience == 2
    assert p.degree == "in_progress"


def test_local_overlay_merges_skills(tmp_path: Path) -> None:
    (tmp_path / "profile.local.yaml").write_text("skills:\n  python: used\n")
    base = load_seed()
    p = load_seed(local=tmp_path / "profile.local.yaml")
    assert p.skills["python"] == "used"
    assert {k: v for k, v in p.skills.items() if k != "python"} == {
        k: v for k, v in base.skills.items() if k != "python"
    }


def test_unknown_level_rejected() -> None:
    with pytest.raises(ValidationError):
        Profile.model_validate({**load_seed().model_dump(), "skills": {"go": "expert"}})
