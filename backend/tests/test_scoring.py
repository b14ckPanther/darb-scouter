import json
import re
from pathlib import Path
from typing import Any

from scouter.models import Education, Evidence, JobProfile, Profile, RequirementItem
from scouter.profile import load_seed
from scouter.scoring import score
from scouter.vocab import is_any_of, skills_in

FIXTURES = Path(__file__).resolve().parents[2] / "frontend/src/data/fixtures/jobs.json"
SENIORITY = {"junior": "junior", "intern": "intern", "unlabeled": "unknown", "middle": "mid"}


def ev(text: str) -> Evidence:
    return Evidence(quote=text, display=text, source="post")


def item(text: str) -> RequirementItem:
    return RequirementItem(skills=skills_in(text), any_of=is_any_of(text), evidence=ev(text))


def all_proven(skills: list[str]) -> Profile:
    return Profile(years_experience=2, skills={s: "proven" for s in skills}, degree="in_progress")


def test_three_years_cannot_exceed_9000() -> None:
    jp = JobProfile(must_have=[item("React"), item("Node.js")], seniority="junior", min_years_experience=3)
    assert score(jp, all_proven(["react", "nodejs"]), "Center: in your region").total <= 9000


def test_every_hard_requirement_has_a_line() -> None:
    jp = JobProfile(must_have=[item("React"), item("Node.js"), item("SQL"), item("Fortran 77 wizardry")])
    lines = [x for x in score(jp, load_seed(), "x").lines if x.kind == "must"]
    assert len(lines) == 4
    assert lines[3].points == 0 and lines[3].label.startswith("Unrecognised:")


def test_or_takes_best_and_takes_weakest() -> None:
    p = load_seed()  # python: learning, nodejs: proven
    either = score(JobProfile(must_have=[item("Python or Node")]), p, "x").lines[0]
    both = score(JobProfile(must_have=[item("Python and Node")]), p, "x").lines[0]
    assert either.points == 10000 and either.skill == "nodejs"
    assert both.points == round(10000 * (0.3 + 1) / 2) and both.skill == "python"


def test_train_gain_reaches_full_points() -> None:
    line = score(JobProfile(must_have=[item("Python"), item("React")]), load_seed(), "x").lines[0]
    assert line.train_gain is not None and line.points + line.train_gain == 5000


def test_degree_partly_met_until_completed() -> None:
    jp = JobProfile(education=Education(degree_required=True, evidence=ev("B.Sc. in CS")))
    p = load_seed()
    assert next(x for x in score(jp, p, "x").lines if x.kind == "education").points == -300
    done = p.model_copy(update={"degree": "completed"})
    assert next(x for x in score(jp, done, "x").lines if x.kind == "education").points == 0


def profile_from_fixture_lines(job: dict[str, Any]) -> JobProfile:
    jp = JobProfile(seniority=SENIORITY.get(job["seniority"], "senior+"))  # type: ignore[arg-type]
    for line in job["score"]["lines"]:
        quote = line.get("evidence", {}).get("quote", "")
        if line["kind"] == "must":
            jp.must_have.append(item(quote))
        elif line["kind"] == "nice":
            jp.nice_to_have.append(item(quote))
        elif line["kind"] == "experience" and (m := re.match(r"(\d+)\+ years", line["label"])):
            jp.min_years_experience = float(m.group(1))
        elif line["kind"] == "education":
            jp.education = Education(degree_required=True, gpa_required=line["points"] == -600, evidence=ev(quote))
    return jp


def test_matches_fixture_totals() -> None:
    p = load_seed()
    for job in json.loads(FIXTURES.read_text()):
        region = next(x["label"] for x in job["score"]["lines"] if x["kind"] == "location")
        got = score(profile_from_fixture_lines(job), p, region)
        assert abs(got.total - job["score"]["total"]) <= 1, job["id"]
