"""Load the seed profile, with an optional git-ignored local overlay."""

from pathlib import Path
from typing import Any

import yaml

from scouter.models import Profile

HERE = Path(__file__).parent


def _merge(base: dict[str, Any], over: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_seed(seed: Path = HERE / "profile.yaml", local: Path = HERE / "profile.local.yaml") -> Profile:
    data: dict[str, Any] = yaml.safe_load(seed.read_text())
    if local.exists():
        data = _merge(data, yaml.safe_load(local.read_text()) or {})
    return Profile.model_validate(data)
