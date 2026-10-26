"""Hybrid job search: BM25 over title/company/text plus multilingual vectors, fused by reciprocal rank."""

from typing import Any

from elasticsearch import Elasticsearch
from pydantic import BaseModel

from scouter.embed import Embedder
from scouter.models import Job

RRF_K = 60


class SearchFilters(BaseModel):
    min_score: int | None = None
    max_score: int | None = None
    source: str | None = None
    seniority: str | None = None
    work_mode: str | None = None
    since: str | None = None


def rrf(rankings: list[list[str]], k: int = RRF_K) -> list[str]:
    """Reciprocal-rank fusion: ids ranked well in several lists rise to the top."""
    score: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            score[doc] = score.get(doc, 0.0) + 1.0 / (k + rank)
    return sorted(score, key=lambda d: -score[d])


def _filters(f: SearchFilters) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    rng = {k: v for k, v in (("gte", f.min_score), ("lte", f.max_score)) if v is not None}
    if rng:
        out.append({"range": {"score": rng}})
    for field, value in (("source", f.source), ("seniority", f.seniority), ("workMode", f.work_mode)):
        if value:
            out.append({"term": {field: value}})
    if f.since:
        out.append({"range": {"foundAt": {"gte": f.since}}})
    return out


def build_query(q: str, f: SearchFilters) -> dict[str, Any]:
    must: list[dict[str, Any]] = (
        [{"multi_match": {"query": q, "fields": ["title^3", "company^2", "text"]}}]
        if q.strip()
        else [{"match_all": {}}]
    )
    return {"bool": {"must": must, "filter": _filters(f)}}


class EsIndexer:
    def __init__(self, url: str, embedder: Embedder, index: str = "jobs") -> None:
        self.es = Elasticsearch(url, request_timeout=10)
        self.embedder = embedder
        self.name = index

    def ensure_index(self) -> None:
        if self.es.indices.exists(index=self.name):
            return
        self.es.indices.create(
            index=self.name,
            mappings={
                "properties": {
                    "title": {"type": "text"},
                    "company": {"type": "text"},
                    "text": {"type": "text"},
                    "vector": {"type": "dense_vector", "dims": self.embedder.dim, "similarity": "cosine"},
                    "source": {"type": "keyword"},
                    "seniority": {"type": "keyword"},
                    "workMode": {"type": "keyword"},
                    "score": {"type": "integer"},
                    "foundAt": {"type": "date"},
                }
            },
        )

    def reset(self) -> None:
        self.es.indices.delete(index=self.name, ignore_unavailable=True)
        self.ensure_index()

    def refresh(self) -> None:
        self.es.indices.refresh(index=self.name)

    def index(self, job: Job, text: str, source: str = "") -> None:
        self.ensure_index()
        [vector] = self.embedder.encode([f"{job.title}\n{text[:2000]}"], kind="passage")
        self.es.index(
            index=self.name,
            id=job.id,
            document={
                "title": job.title,
                "company": job.company,
                "text": text,
                "vector": vector,
                "source": source,
                "seniority": job.seniority,
                "workMode": job.work_mode,
                "score": job.score.total,
                "foundAt": job.found_at,
            },
        )

    def search(self, q: str, f: SearchFilters, k: int = 50) -> list[str]:
        query = build_query(q, f)
        bm25 = self.es.search(index=self.name, query=query, size=k, source=False)
        lists = [[h["_id"] for h in bm25["hits"]["hits"]]]
        if q.strip():
            [vector] = self.embedder.encode([q], kind="query")
            knn = self.es.search(
                index=self.name,
                knn={
                    "field": "vector",
                    "query_vector": vector,
                    "k": k,
                    "num_candidates": 100,
                    "filter": query["bool"]["filter"],
                    "similarity": 0.5,
                },
                size=k,
                source=False,
            )
            lists.append([h["_id"] for h in knn["hits"]["hits"]])
        return rrf(lists)
