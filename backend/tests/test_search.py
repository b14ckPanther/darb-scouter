import os

import pytest

from scouter.models import Job, Score
from scouter.search import EsIndexer, SearchFilters, build_query, rrf

ES = os.environ.get("ELASTIC_URL")


def test_rrf_merges_rankings() -> None:
    assert set(rrf([["a", "b", "c"], ["c", "b", "d"]])[:2]) == {"b", "c"}
    assert rrf([["a"], []]) == ["a"]
    assert set(rrf([["a", "b"], ["c"]])) == {"a", "b", "c"}


def test_filters_build_query() -> None:
    q = build_query("react", SearchFilters(min_score=7000, max_score=9500, source="greenhouse", work_mode="hybrid"))
    filters = q["bool"]["filter"]
    assert {"range": {"score": {"gte": 7000, "lte": 9500}}} in filters
    assert {"term": {"source": "greenhouse"}} in filters and {"term": {"workMode": "hybrid"}} in filters
    assert q["bool"]["must"][0]["multi_match"]["query"] == "react"


def test_empty_query_matches_all() -> None:
    assert build_query("", SearchFilters())["bool"]["must"] == [{"match_all": {}}]


class FakeEmbedder:
    """'developer' and its Hebrew word share a direction; everything else is orthogonal."""

    dim = 3

    def encode(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        out = []
        for t in texts:
            low = t.lower()
            if "developer" in low or "מפתח" in t:
                out.append([1.0, 0.0, 0.0])
            elif "designer" in low:
                out.append([0.0, 1.0, 0.0])
            else:
                out.append([0.0, 0.0, 1.0])
        return out


def job(i: str, title: str, total: int) -> Job:
    return Job(
        id=i,
        title=title,
        company="Acme",
        city="Haifa",
        work_mode="onsite",
        url=f"https://x/{i}",
        posted_at="2026-10-25T00:00:00.000Z",
        found_at="2026-10-25T00:00:00.000Z",
        seniority="junior",
        score=Score(total=total, lines=[]),
    )


@pytest.mark.es
@pytest.mark.skipif(not ES, reason="needs ELASTIC_URL")
def test_hebrew_query_finds_english_job() -> None:
    idx = EsIndexer(ES or "", FakeEmbedder(), index="jobs_test")
    idx.reset()
    idx.index(job("1", "Junior Backend Developer", 8000), "APIs in Python")
    idx.index(job("2", "Product Designer", 7000), "Figma")
    idx.index(job("3", "Data Analyst", 6000), "SQL dashboards")
    idx.refresh()
    assert idx.search("מפתח", SearchFilters())[0] == "1"
    assert idx.search("designer", SearchFilters(min_score=7500)) == []
