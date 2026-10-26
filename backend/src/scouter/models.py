"""Domain models shared by every layer. JSON uses camelCase to match frontend/src/domain/types.ts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


WorkMode = Literal["onsite", "hybrid", "remote"]
Stage = Literal[
    "saved", "applied", "hr_call", "tech_interview", "home_task", "final_interview", "offer", "rejected", "withdrawn"
]
Level = Literal["proven", "used", "learning"]


class Requirement(Model):
    text: str
    priority: Literal["required", "preferred"]


class RawJob(Model):
    source: str
    source_id: str
    url: str
    title: str
    company: str
    location: str | None = None
    work_mode: WorkMode | None = None
    posted_at: datetime | None = None
    seniority: str | None = None
    text: str
    requirements: list[Requirement] = Field(default_factory=list)
    language: Literal["en", "he"] = "en"


class Evidence(Model):
    quote: str
    display: str
    source: Literal["post", "freehire"]


class RequirementItem(Model):
    """One requirement line. Empty `skills` means the line names nothing in the vocabulary."""

    skills: list[str]
    any_of: bool = False
    evidence: Evidence


class Education(Model):
    degree_required: bool
    gpa_required: bool = False
    evidence: Evidence | None = None


class JobProfile(Model):
    must_have: list[RequirementItem] = Field(default_factory=list)
    nice_to_have: list[RequirementItem] = Field(default_factory=list)
    min_years_experience: float | None = None
    years_evidence: Evidence | None = None
    seniority: Literal["intern", "junior", "mid", "senior+", "unknown"] = "unknown"
    education: Education | None = None
    work_mode: WorkMode | None = None
    is_defense: bool = False
    defense_evidence: Evidence | None = None
    study_years_left_required: float | None = None


class ScoreLine(Model):
    kind: Literal["must", "nice", "seniority", "experience", "education", "location"]
    label: str
    points: int
    evidence: Evidence | None = None
    skill: str | None = None
    train_gain: int | None = None
    train_label: str | None = None


class Score(Model):
    total: int
    lines: list[ScoreLine]


class Job(Model):
    id: str
    title: str
    company: str
    city: str
    work_mode: WorkMode
    url: str
    posted_at: str
    found_at: str
    seniority: str
    score: Score


class StageEntry(Model):
    stage: Stage
    at: str


class Application(Model):
    id: str
    job_id: str
    stage: Stage
    history: list[StageEntry]
    notes: str = ""
    contact: str | None = None
    cv_version: str | None = None


class Profile(Model):
    """Nour's profile. Seeded from profile.yaml, then lives in Postgres and is edited in Settings."""

    version: int = 0
    years_experience: float
    skills: dict[str, Level]
    degree: Literal["in_progress", "completed"]
    months_to_graduation: int = 0
    show_hidden_regions: bool = False
    show_senior: bool = False
    excluded_companies: list[str] = Field(default_factory=list)


class SourceResult(Model):
    found: int = 0
    new: int = 0
    failed: bool = False
    error: str | None = None


class RunSummary(Model):
    started_at: str
    finished_at: str | None = None
    per_source: dict[str, SourceResult] = Field(default_factory=dict)
    new_jobs: int = 0
    new_matches: int = 0
    top_score: int | None = None
    dropped: dict[str, int] = Field(default_factory=dict)
    alerts_failed: int = 0


class Board(Model):
    company: str
    provider: Literal["greenhouse", "lever", "comeet"]
    token: str
