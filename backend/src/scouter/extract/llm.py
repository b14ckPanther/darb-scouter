"""The one LLM call: Claude returns a draft that the graph then verifies against the post."""

from pathlib import Path
from typing import Literal, Protocol

import anthropic
from pydantic import BaseModel, Field

from scouter.models import Requirement

SYSTEM = (Path(__file__).parent / "prompt.md").read_text()


class DraftItem(BaseModel):
    skill_phrases: list[str] = Field(default_factory=list)
    any_of: bool = False
    quote: str
    display: str


class LLMDraft(BaseModel):
    must_have: list[DraftItem] = Field(default_factory=list)
    nice_to_have: list[DraftItem] = Field(default_factory=list)
    min_years_experience: float | None = None
    years_quote: str | None = None
    seniority: Literal["intern", "junior", "mid", "senior+", "unknown"] = "unknown"
    degree_required: bool = False
    gpa_required: bool = False
    education_quote: str | None = None
    work_mode: Literal["onsite", "hybrid", "remote"] | None = None
    is_defense: bool = False
    defense_quote: str | None = None
    study_years_left_required: float | None = None
    study_quote: str | None = None


class ExtractionError(Exception):
    """The model declined or returned nothing usable. The job stays pending and is retried next run."""


class LLM(Protocol):
    def extract(self, text: str, requirements: list[Requirement], model: str) -> LLMDraft: ...


def user_message(text: str, requirements: list[Requirement]) -> str:
    parts = [f"<post>\n{text}\n</post>"]
    if requirements:
        lines = "\n".join(f"- [{r.priority}] {r.text}" for r in requirements)
        parts.append(f"<requirement_lines>\n{lines}\n</requirement_lines>")
    return "\n\n".join(parts)


class AnthropicLLM:
    def __init__(self, client: anthropic.Anthropic | None = None) -> None:
        self.client = client or anthropic.Anthropic()

    def extract(self, text: str, requirements: list[Requirement], model: str) -> LLMDraft:
        try:
            res = self.client.beta.messages.parse(
                model=model,
                max_tokens=16000,
                # the system prompt never changes, so it is cached across every job in a run
                system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user_message(text, requirements)}],
                output_format=LLMDraft,
                # a policy decline is retried on a fallback model inside the same call
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as e:
            raise ExtractionError(f"{type(e).__name__}: {e}") from e
        if res.stop_reason == "refusal":
            raise ExtractionError("the model declined this post")
        if res.parsed_output is None:
            raise ExtractionError(f"no structured output (stop_reason={res.stop_reason})")
        return res.parsed_output
