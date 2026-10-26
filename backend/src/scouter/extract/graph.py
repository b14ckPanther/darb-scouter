"""LangGraph pipeline: draft (LLM) -> verify_quotes -> normalize_skills -> finalize."""

import hashlib
import json
import logging
import math
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from scouter.embed import Embedder
from scouter.extract.llm import LLM, DraftItem, LLMDraft
from scouter.extract.quotes import verify
from scouter.models import Education, Evidence, JobProfile, RawJob, RequirementItem
from scouter.vocab import SKILLS, canonical, skills_in

log = logging.getLogger(__name__)
SEMANTIC_MATCH = 0.85


class State(TypedDict, total=False):
    raw: RawJob
    model: str
    draft: LLMDraft
    dropped: list[str]
    must: list[tuple[DraftItem, Evidence]]
    nice: list[tuple[DraftItem, Evidence]]
    evidence: dict[str, Evidence | None]
    items: dict[str, list[RequirementItem]]
    profile: JobProfile


def content_hash(raw: RawJob, model: str) -> str:
    reqs = json.dumps([r.model_dump() for r in raw.requirements], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(f"{model}\n{raw.text}\n{reqs}".encode()).hexdigest()


def _evidence(raw: RawJob, quote: str | None, display: str | None = None) -> Evidence | None:
    """Evidence for a quote found in the post, labelled with where it was found; None when it isn't there."""
    if not quote:
        return None
    if raw.source == "freehire" and any(verify(quote, r.text) for r in raw.requirements):
        return Evidence(quote=quote, display=display or quote, source="freehire")
    if verify(quote, raw.text) or any(verify(quote, r.text) for r in raw.requirements):
        return Evidence(quote=quote, display=display or quote, source="post")
    return None


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def build_graph(llm: LLM, embedder: Embedder | None = None) -> Any:
    label_vectors: list[list[float]] | None = None

    def draft(state: State) -> State:
        raw = state["raw"]
        return {"draft": llm.extract(raw.text, raw.requirements, state["model"]), "dropped": []}

    def verify_quotes(state: State) -> State:
        raw, d, dropped = state["raw"], state["draft"], list(state["dropped"])

        def keep(items: list[DraftItem], kind: str) -> list[tuple[DraftItem, Evidence]]:
            out = []
            for i in items:
                ev = _evidence(raw, i.quote, i.display)
                if ev:
                    out.append((i, ev))
                else:
                    dropped.append(f"{kind}: quote not in post: {i.quote!r}")
            return out

        evidence: dict[str, Evidence | None] = {}
        for name, flag, quote in (
            ("years", d.min_years_experience is not None, d.years_quote),
            ("education", d.degree_required, d.education_quote),
            ("defense", d.is_defense, d.defense_quote),
            ("study", d.study_years_left_required is not None, d.study_quote),
        ):
            evidence[name] = _evidence(raw, quote) if flag else None
            if flag and evidence[name] is None:
                dropped.append(f"{name}: quote not in post: {quote!r}")
        return {
            "must": keep(d.must_have, "must"),
            "nice": keep(d.nice_to_have, "nice"),
            "evidence": evidence,
            "dropped": dropped,
        }

    def semantic(phrase: str) -> str | None:
        nonlocal label_vectors
        if embedder is None:
            return None
        if label_vectors is None:
            label_vectors = embedder.encode([s.label for s in SKILLS], kind="query")
        [v] = embedder.encode([phrase], kind="query")
        score, best = max((_cosine(v, lv), s.id) for lv, s in zip(label_vectors, SKILLS, strict=True))
        return best if score >= SEMANTIC_MATCH else None

    def to_item(i: DraftItem, ev: Evidence) -> RequirementItem:
        ids: list[str] = []
        for phrase in i.skill_phrases:
            k = canonical(phrase) or next(iter(skills_in(phrase)), None) or semantic(phrase)
            if k and k not in ids:
                ids.append(k)
        if not ids:
            ids = skills_in(ev.quote)
        return RequirementItem(skills=ids, any_of=i.any_of, evidence=ev)

    def normalize_skills(state: State) -> State:
        return {
            "items": {
                "must": [to_item(i, e) for i, e in state["must"]],
                "nice": [to_item(i, e) for i, e in state["nice"]],
            }
        }

    def finalize(state: State) -> State:
        d, ev = state["draft"], state["evidence"]
        jp = JobProfile(
            must_have=state["items"]["must"],
            nice_to_have=state["items"]["nice"],
            min_years_experience=d.min_years_experience if ev["years"] else None,
            years_evidence=ev["years"],
            seniority=d.seniority,
            education=Education(degree_required=True, gpa_required=d.gpa_required, evidence=ev["education"])
            if ev["education"]
            else None,
            work_mode=d.work_mode,
            is_defense=ev["defense"] is not None,
            defense_evidence=ev["defense"],
            study_years_left_required=d.study_years_left_required if ev["study"] else None,
        )
        return {"profile": jp}

    g = StateGraph(State)
    g.add_node("draft", draft)
    g.add_node("verify_quotes", verify_quotes)
    g.add_node("normalize_skills", normalize_skills)
    g.add_node("finalize", finalize)
    g.add_edge(START, "draft")
    g.add_edge("draft", "verify_quotes")
    g.add_edge("verify_quotes", "normalize_skills")
    g.add_edge("normalize_skills", "finalize")
    g.add_edge("finalize", END)
    return g.compile()


def extract_profile(
    raw: RawJob, llm: LLM, embedder: Embedder | None = None, *, model: str
) -> tuple[JobProfile, list[str]]:
    out = build_graph(llm, embedder).invoke({"raw": raw, "model": model})
    for line in out["dropped"]:
        log.info("dropped from %s: %s", raw.url, line)
    return out["profile"], out["dropped"]
