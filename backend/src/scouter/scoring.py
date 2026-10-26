"""The power level. Deterministic code over an extracted JobProfile: the LLM extracts, it never scores.

Honest by construction (spec §4): only quoted requirements earn points, every hard requirement
gets a line (unrecognised ones score 0), and seniority, experience and education can only cost.
"""

import math
from typing import Literal

from scouter.models import JobProfile, Level, Profile, RequirementItem, Score, ScoreLine
from scouter.vocab import label

LEVEL: dict[Level, float] = {"proven": 1.0, "used": 0.7, "learning": 0.3}
MUST = 8500
NICE = 1500
SENIORITY = {"intern": 0, "junior": 0, "unknown": 0, "mid": -800, "senior+": -3000}
PER_YEAR = 1600
DEGREE_PARTLY = -300
DEGREE_AND_GPA = -600


def _round(x: float) -> int:
    """Half-up rounding, as JavaScript's Math.round does (the prototype's fixtures use it)."""
    return math.floor(x + 0.5)


def _fmt_years(y: float) -> str:
    return str(int(y)) if y == int(y) else str(y)


def _skill_line(item: RequirementItem, per: float, kind: Literal["must", "nice"], profile: Profile) -> ScoreLine:
    text = item.evidence.quote
    if not item.skills:
        short = text[:46] + "…" if len(text) > 48 else text
        return ScoreLine(kind=kind, label=f"Unrecognised: {short}", points=0, evidence=item.evidence)

    def lv(k: str) -> float:
        level = profile.skills.get(k)
        return LEVEL[level] if level else 0.0

    best = item.skills[0]
    weakest = item.skills[0]
    for k in item.skills[1:]:
        if lv(k) > lv(best):
            best = k
        if lv(k) < lv(weakest):
            weakest = k
    lvl = lv(best) if item.any_of else sum(lv(k) for k in item.skills) / len(item.skills)
    points = _round(per * lvl)
    trained = best if item.any_of else weakest
    return ScoreLine(
        kind=kind,
        label=label(best) if item.any_of or len(item.skills) == 1 else " + ".join(label(k) for k in item.skills),
        skill=trained,
        train_label=label(trained),
        points=points,
        train_gain=_round(per) - points if lvl < 1 else None,
        evidence=item.evidence,
    )


def score(job: JobProfile, profile: Profile, region_label: str) -> Score:
    must, nice = job.must_have, job.nice_to_have
    # the skill budget is always 10,000: split 85/15 when both kinds exist, all to one kind otherwise
    must_budget = (MUST if nice else MUST + NICE) if must else 0
    nice_budget = (NICE if must else MUST + NICE) if nice else 0
    lines: list[ScoreLine] = []
    kinds: tuple[tuple[list[RequirementItem], int, Literal["must", "nice"]], ...] = (
        (must, must_budget, "must"),
        (nice, nice_budget, "nice"),
    )
    for items, budget, kind in kinds:
        per = budget / len(items) if items else 0.0
        lines += [_skill_line(i, per, kind, profile) for i in items]

    lines.append(ScoreLine(kind="seniority", label=f"Seniority: {job.seniority}", points=SENIORITY[job.seniority]))

    years = job.min_years_experience
    if years is not None and years > profile.years_experience:
        lines.append(
            ScoreLine(
                kind="experience",
                label=f"{_fmt_years(years)}+ years required, you have {_fmt_years(profile.years_experience)}"
                + ("" if job.years_evidence else " (quote not verified)"),
                points=-_round((years - profile.years_experience) * PER_YEAR),
                evidence=job.years_evidence,
            )
        )
    else:
        msg = "No experience minimum stated" if years is None else f"{_fmt_years(years)}+ years: you meet it"
        lines.append(ScoreLine(kind="experience", label=msg, points=0, evidence=job.years_evidence))

    edu = job.education
    if edu and edu.degree_required:
        if profile.degree == "completed":
            lines.append(ScoreLine(kind="education", label="Degree: met", points=0, evidence=edu.evidence))
        elif edu.gpa_required:
            lines.append(
                ScoreLine(
                    kind="education",
                    label="Degree + grades required: degree partly met, GPA unchecked",
                    points=DEGREE_AND_GPA,
                    evidence=edu.evidence,
                )
            )
        else:
            lines.append(
                ScoreLine(
                    kind="education",
                    label="Degree required: partly met (final semester)",
                    points=DEGREE_PARTLY,
                    evidence=edu.evidence,
                )
            )

    lines.append(ScoreLine(kind="location", label=region_label, points=0))
    return Score(total=max(0, sum(x.points for x in lines)), lines=lines)
