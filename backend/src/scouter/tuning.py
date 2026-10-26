"""Thresholds from tuning.yaml, loaded once."""

from pathlib import Path
from typing import Any

import yaml

TUNING: dict[str, Any] = yaml.safe_load((Path(__file__).parent / "tuning.yaml").read_text())
