"""Canonical skill vocabulary (vocab.yaml): maps the many ways a post names a skill to one id."""

import re
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Skill:
    id: str
    label: str
    pattern: re.Pattern[str]
    aliases: frozenset[str]


def _load() -> list[Skill]:
    raw = yaml.safe_load((Path(__file__).parent / "vocab.yaml").read_text())
    return [
        Skill(e["id"], e["label"], re.compile(e["pattern"], re.I), frozenset(a.lower() for a in e.get("aliases", [])))
        for e in raw
    ]


SKILLS = _load()
_BY_ID = {s.id: s for s in SKILLS}
_ANY_OF = re.compile(r"\bor\b|/", re.I)


def skills_in(text: str) -> list[str]:
    """Canonical ids named in `text`, in vocabulary order, each once."""
    return [s.id for s in SKILLS if s.pattern.search(text)]


def label(skill: str) -> str:
    return _BY_ID[skill].label if skill in _BY_ID else skill


def is_any_of(text: str) -> bool:
    """True when the line offers alternatives ("Python or Go", "AWS/GCP")."""
    return bool(_ANY_OF.search(text))


def canonical(phrase: str) -> str | None:
    """The id for a single skill phrase: an exact alias first, then a pattern covering the whole phrase."""
    p = phrase.strip().lower()
    for s in SKILLS:
        if p in s.aliases:
            return s.id
    for s in SKILLS:
        if s.pattern.fullmatch(p):
            return s.id
    return None
