"""HTTP API for the frontend. JSON shapes match frontend/src/domain/types.ts (camelCase)."""

import hmac
import logging
import threading
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Protocol

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from scouter import repo
from scouter.collectors.base import Collector
from scouter.collectors.paste import NeedsText, from_text, from_url
from scouter.config import get_settings
from scouter.extract.llm import LLM
from scouter.http import polite_client
from scouter.models import Model, Profile, Stage
from scouter.pipeline import process_job, rescore_all, run_scan
from scouter.search import SearchFilters

log = logging.getLogger(__name__)


class SearchIndex(Protocol):
    def index(self, job: Any, text: str) -> None: ...
    def search(self, q: str, f: SearchFilters, k: int = 50) -> list[str]: ...


@dataclass
class Deps:
    session_factory: Callable[[], Session]
    llm: LLM | None
    indexer: SearchIndex | None = None
    http: Callable[[], httpx.Client] = polite_client
    collectors: Callable[[Session], list[Collector]] | None = None
    token: str | None = None
    frontend_dist: Path | None = None
    close_sessions: bool = False
    model: str = field(default_factory=lambda: get_settings().model_default)
    scan_lock: threading.Lock = field(default_factory=threading.Lock)


def default_deps() -> Deps:
    from scouter.db import session_factory
    from scouter.extract.llm import AnthropicLLM
    from scouter.sources import default_collectors

    s = get_settings()
    indexer: SearchIndex | None = None
    if s.elastic_url:
        from scouter.embed import E5Embedder
        from scouter.search import EsIndexer

        indexer = EsIndexer(s.elastic_url, E5Embedder())
    dist = Path(s.frontend_dist)
    return Deps(
        session_factory=session_factory(),
        llm=AnthropicLLM() if s.anthropic_api_key else None,
        indexer=indexer,
        collectors=default_collectors,
        token=s.scouter_token,
        frontend_dist=dist if dist.is_dir() else None,
        close_sessions=True,
    )


def dump(m: BaseModel) -> dict[str, Any]:
    return m.model_dump(mode="json", by_alias=True, exclude_none=True)


class PasteIn(Model):
    url: str
    text: str | None = None
    title: str | None = None
    company: str | None = None


class ApplyIn(Model):
    job_id: str


class ApplicationPatch(Model):
    stage: Stage | None = None
    notes: str | None = None
    contact: str | None = None
    cv_version: str | None = None


def create_app(deps: Deps | None = None) -> FastAPI:
    d = deps or default_deps()
    app = FastAPI(title="Darb Scouter", docs_url="/api/docs", openapi_url="/api/openapi.json")

    def session() -> Iterator[Session]:
        s = d.session_factory()
        try:
            yield s
        finally:
            if d.close_sessions:
                s.close()

    S = Annotated[Session, Depends(session)]

    @app.middleware("http")
    async def guard(request: Request, call_next: Callable[[Request], Any]) -> Response:
        path = request.url.path
        if d.token and path.startswith("/api/") and path != "/api/health":
            given = request.headers.get("x-scouter-token", "")
            if not hmac.compare_digest(given.encode(), d.token.encode()):
                return JSONResponse({"detail": "Missing or wrong X-Scouter-Token"}, status_code=401)
        response: Response = await call_next(request)
        return response

    @app.get("/api/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/jobs")
    def jobs(
        s: S, sinceFoundAt: datetime | None = None, minScore: int | None = None, includeHidden: bool = False
    ) -> list[dict[str, Any]]:
        return [dump(j) for j in repo.list_jobs(s, sinceFoundAt, minScore, includeHidden)]

    @app.get("/api/jobs/search")
    def search(
        s: S,
        response: Response,
        q: str = "",
        minScore: int | None = None,
        maxScore: int | None = None,
        stage: Stage | None = None,
        source: str | None = None,
        seniority: str | None = None,
        workMode: str | None = None,
        since: str | None = None,
    ) -> list[dict[str, Any]]:
        f = SearchFilters(
            min_score=minScore, max_score=maxScore, source=source, seniority=seniority, work_mode=workMode, since=since
        )
        found = None
        if d.indexer:
            try:
                ids = d.indexer.search(q, f)
                by_id = {j.id: j for j in repo.list_jobs(s, ids=ids)}
                found = [by_id[i] for i in ids if i in by_id]
            except Exception:  # noqa: BLE001 - search falls back to the database
                log.warning("search index unavailable, falling back to SQL", exc_info=True)
        if found is None:
            response.headers["X-Search-Fallback"] = "1"
            needle = q.strip().lower()
            found = [
                j
                for j in repo.list_jobs(s, min_score=minScore)
                if (not needle or needle in j.title.lower() or needle in j.company.lower())
                and (maxScore is None or j.score.total <= maxScore)
                and (not workMode or j.work_mode == workMode)
                and (not seniority or j.seniority == seniority)
            ]
        if stage:
            staged = {a.job_id for a in repo.list_applications(s) if a.stage == stage}
            found = [j for j in found if j.id in staged]
        return [dump(j) for j in found]

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str, s: S) -> dict[str, Any]:
        j = repo.get_job(s, job_id)
        if j is None:
            raise HTTPException(404, f"No job {job_id}")
        return dump(j)

    @app.post("/api/jobs/paste", status_code=201)
    def paste(body: PasteIn, s: S) -> Any:
        if body.text:
            title = body.title or "Pasted job"
            company = body.company or (httpx.URL(body.url).host.removeprefix("www.").split(".")[0].title() or "Unknown")
            raw = from_text(body.url, body.text, title, company)
        else:
            with d.http() as c:
                got = from_url(c, body.url)
            if isinstance(got, NeedsText):
                return JSONResponse({"needsText": True, "reason": got.reason}, status_code=422)
            raw = got
        if d.llm is None:
            raise HTTPException(503, "Set ANTHROPIC_API_KEY to read pasted jobs")
        job_id, _ = repo.upsert_job(s, raw, repo.utcnow())
        row = repo.job_row(s, job_id)
        if row.status == "pending":
            try:
                outcome = process_job(s, row, d.llm, d.indexer, model=d.model)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(502, f"Couldn't read the job: {e}") from e
            if outcome == "defense":
                return JSONResponse(
                    {"needsText": False, "reason": "Defense or military company: never shown"}, status_code=422
                )
        j = repo.get_job(s, job_id)
        if j is None:
            raise HTTPException(500, "The job was stored but not scored")
        return dump(j)

    @app.get("/api/runs/latest")
    def latest_run(s: S) -> dict[str, Any]:
        r = repo.latest_run(s)
        if r is None:
            raise HTTPException(404, "No scan has run yet")
        return dump(r)

    @app.post("/api/runs", status_code=202)
    def start_run() -> dict[str, str]:
        if d.collectors is None or d.llm is None:
            raise HTTPException(503, "Scans need ANTHROPIC_API_KEY and configured sources")
        if not d.scan_lock.acquire(blocking=False):
            raise HTTPException(409, "A scan is already running")
        collectors, llm = d.collectors, d.llm

        def work() -> None:
            s = d.session_factory()
            try:
                run_scan(s, collectors(s), llm, d.indexer, repo.utcnow(), model=d.model)
            except Exception:
                log.exception("manual scan failed")
            finally:
                s.close()
                d.scan_lock.release()

        threading.Thread(target=work, name="scan", daemon=True).start()
        return {"status": "started"}

    @app.get("/api/applications")
    def applications(s: S) -> list[dict[str, Any]]:
        return [dump(a) for a in repo.list_applications(s)]

    @app.post("/api/applications")
    def apply(body: ApplyIn, s: S) -> dict[str, Any]:
        try:
            return dump(repo.apply(s, body.job_id))
        except KeyError as e:
            raise HTTPException(404, f"No job {body.job_id}") from e

    @app.patch("/api/applications/{app_id}")
    def update_application(app_id: str, body: ApplicationPatch, s: S) -> dict[str, Any]:
        try:
            return dump(repo.update_application(s, app_id, body.stage, body.notes, body.contact, body.cv_version))
        except KeyError as e:
            raise HTTPException(404, f"No application {app_id}") from e

    @app.get("/api/profile")
    def profile(s: S) -> dict[str, Any]:
        return dump(repo.current_profile(s))

    @app.put("/api/profile")
    def save_profile(body: Profile, s: S) -> dict[str, Any]:
        saved = repo.save_profile(s, body)
        rescore_all(s)
        return dump(saved)

    if d.frontend_dist:
        dist = d.frontend_dist
        app.mount("/assets", StaticFiles(directory=dist / "assets", check_dir=False), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            f = (dist / path).resolve()
            if path and f.is_file() and f.is_relative_to(dist.resolve()):
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


def __getattr__(name: str) -> Any:
    # `uvicorn scouter.api:app` builds the real app on first access, so importing this module stays cheap
    if name == "app":
        return create_app()
    raise AttributeError(name)
