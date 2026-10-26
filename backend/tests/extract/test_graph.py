from scouter.extract.graph import content_hash, extract_profile
from scouter.extract.llm import DraftItem, LLMDraft
from scouter.models import RawJob, Requirement

POST = """Junior Backend Developer
Requirements:
- Experience with NodeJS
- Knowledge of SQL databases
- Hands-on with Quantum Basket Weaving
Nice to have: AWS"""


class FakeLLM:
    def __init__(self, draft: LLMDraft) -> None:
        self.draft = draft
        self.calls = 0

    def extract(self, text: str, requirements: list[Requirement], model: str) -> LLMDraft:
        self.calls += 1
        return self.draft


def raw(source: str = "post", text: str = POST, reqs: list[Requirement] | None = None) -> RawJob:
    return RawJob(
        source=source, source_id="1", url="u", title="Dev", company="Acme", text=text, requirements=reqs or []
    )


def item(phrases: list[str], quote: str) -> DraftItem:
    return DraftItem(skill_phrases=phrases, any_of=False, quote=quote, display=quote)


def test_invented_quote_dropped() -> None:
    draft = LLMDraft(must_have=[item(["NodeJS"], "Experience with NodeJS"), item(["Go"], "5 years of Go at scale")])
    jp, dropped = extract_profile(raw(), FakeLLM(draft), model="m")
    assert [i.skills for i in jp.must_have] == [["nodejs"]]
    assert len(dropped) == 1 and "5 years of Go" in dropped[0]


def test_aliases_become_canonical() -> None:
    jp, _ = extract_profile(raw(), FakeLLM(LLMDraft(must_have=[item(["NodeJS"], "Experience with NodeJS")])), model="m")
    assert jp.must_have[0].skills == ["nodejs"]


def test_skills_found_in_quote_when_phrase_is_unknown() -> None:
    draft = LLMDraft(must_have=[item(["relational DBs"], "Knowledge of SQL databases")])
    jp, _ = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.must_have[0].skills == ["sql"]


def test_unknown_phrase_kept_as_unrecognised() -> None:
    draft = LLMDraft(must_have=[item(["basket weaving"], "Hands-on with Quantum Basket Weaving")])
    jp, _ = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.must_have[0].skills == [] and jp.must_have[0].evidence.quote.endswith("Weaving")


def test_defense_flag_requires_evidence() -> None:
    draft = LLMDraft(is_defense=True, defense_quote="Security clearance required")
    jp, dropped = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.is_defense is False and dropped
    ok = LLMDraft(is_defense=True, defense_quote="Experience with NodeJS")
    assert extract_profile(raw(), FakeLLM(ok), model="m")[0].is_defense is True


def test_years_without_evidence_keep_their_cost() -> None:
    jp, _ = extract_profile(raw(), FakeLLM(LLMDraft(min_years_experience=3, years_quote="3+ years")), model="m")
    assert jp.min_years_experience == 3 and jp.years_evidence is None


def test_freehire_quotes_labelled() -> None:
    reqs = [Requirement(text="Experience with NodeJS", priority="required")]
    draft = LLMDraft(must_have=[item(["NodeJS"], "Experience with NodeJS"), item(["AWS"], "Nice to have: AWS")])
    jp, _ = extract_profile(raw(source="freehire", reqs=reqs), FakeLLM(draft), model="m")
    assert [i.evidence.source for i in jp.must_have] == ["freehire", "post"]


def test_content_hash_changes_with_model_and_text() -> None:
    assert content_hash(raw(), "a") != content_hash(raw(), "b")
    assert content_hash(raw(), "a") != content_hash(raw(text=POST + "!"), "a")
    assert content_hash(raw(), "a") == content_hash(raw(), "a")


def test_unverified_years_still_cost_points() -> None:
    draft = LLMDraft(
        must_have=[item(["NodeJS"], "Experience with NodeJS")], min_years_experience=3, years_quote="3+ yrs"
    )
    jp, dropped = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.min_years_experience == 3 and jp.years_evidence is None and dropped


def test_unverified_degree_still_counts() -> None:
    draft = LLMDraft(degree_required=True, education_quote="BSc in CS")
    jp, _ = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.education is not None and jp.education.degree_required and jp.education.evidence is None


def test_skill_must_be_named_by_its_quote() -> None:
    draft = LLMDraft(
        must_have=[
            DraftItem(skill_phrases=["NodeJS", "TypeScript"], any_of=True, quote="Experience with NodeJS", display="x")
        ]
    )
    jp, _ = extract_profile(raw(), FakeLLM(draft), model="m")
    assert jp.must_have[0].skills == ["nodejs"]


def test_anthropic_client_has_a_short_timeout() -> None:
    from scouter.extract.llm import AnthropicLLM

    assert AnthropicLLM().client.timeout <= 90
