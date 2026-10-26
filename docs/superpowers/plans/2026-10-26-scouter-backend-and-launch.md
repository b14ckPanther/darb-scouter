# Darb Scouter Backend, Alerts and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Darb Scouter from a fixture-backed prototype to the daily tool the spec describes: real collectors, an honest LLM-extract / code-score pipeline, a 07:00 scan on Nour's Mac with catch-up on wake, Telegram alerts, the frontend on the real API, evals, and a public launch.

**Architecture:** A Python package `scouter` in `backend/` runs collectors → filters → dedupe → LangGraph extraction (Claude, cached by content hash) → deterministic scorer → Postgres + Elasticsearch. FastAPI serves the JSON the frontend already consumes (same `Job`/`Score`/`Application` shapes as `frontend/src/domain/types.ts`) and the built frontend itself, on one port, reached from the phone over Tailscale. APScheduler in its own container runs the scan and sends Telegram messages.

**Tech Stack:** Python 3.13, uv, ruff, mypy, pytest, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2 + Alembic, PostgreSQL 16, httpx, selectolax, rapidfuzz, LangGraph + Anthropic SDK, sentence-transformers (`intfloat/multilingual-e5-small`), Elasticsearch 8, APScheduler 3, Docker Compose, GitHub Actions. Frontend unchanged (Vite 6, React 19, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-25-darb-scouter-design.md` (phases 4–7 of §11; phases 1–3 are on `main`).

## Global Constraints

- Commits are authored by Nour Alden Mousa <nmcryptoinvest@gmail.com> only. No `Co-Authored-By`, no AI attribution in commits, PRs or docs. The message ends with its last real line.
- Secrets (Anthropic key, Telegram token, `SCOUTER_TOKEN`) only in env vars / `.env`, which git ignores. `.env.example` lists names with empty values.
- No LinkedIn scraping, no login-walled scraping. LinkedIn arrives only via paste-a-link. Rate-limit (≥1 s between requests per host), cache, and send `User-Agent: darb-scouter/0.1 (personal job scout; github.com/b14ckPanther)`.
- No live sites in tests or CI: collectors are tested against saved files under `backend/tests/fixtures/`.
- The LLM extracts, it never scores. Every extracted item carries an `evidence.quote` that appears verbatim in the job text, or it is dropped and logged.
- Model IDs live in config: default `claude-sonnet-5-5`, cheap re-runs `claude-haiku-5-5`.
- Score scale 0–10,000+; over 9,000 = strong, realistic match. A job requiring 3+ years must not score over 9,000 against Nour's current profile.
- Never show defense/military companies: exclusion list + `is_defense` flag; dropped before scoring, counted in the run summary.
- Region: north to center Israel kept; Jerusalem and the south hidden by default (toggle shows them).
- Student-only roles needing 1.5+ years of study left are hidden. "B.Sc. required" counts as partly met until the profile says the degree is completed.
- The API's JSON matches `frontend/src/domain/types.ts` exactly (camelCase). Screens must not change shape to fit the backend.
- No official Dragon Ball art, logos, characters or audio anywhere, including the README GIF.
- Repo stays private until Task 19's final step, which asks Nour before flipping it.

## Review Focus

1. **A source changes its page format and the collector parses zero jobs from a 200 response.** Expect a loud `CollectorError` recorded in the run and shown on the Radar, never a silent "0 found". Test in Task 7.
2. **A Hebrew post whose quote differs from the text only by bidi marks, NBSP or line breaks.** Expect the quote to verify (NFC + bidi-mark strip + whitespace collapse on both sides), and a quote that is truly absent to be dropped. Test in Task 11.
3. **The Mac sleeps through 07:00 and wakes at 09:30.** Expect exactly one scan that day: the catch-up and the misfired cron job must not both run. Test in Task 15.
4. **A job disappears from its source after Nour applied to it.** Expect the job and application to stay retrievable, never deleted by a later scan. Test in Task 12.
5. **Telegram or the Anthropic API is down during the 07:00 run.** Expect the scan to finish: an alert failure is logged in the run, an extraction failure leaves the job `pending` and retries next run without being scored. Tests in Tasks 12 and 15.

---

## File Structure

```
backend/
  pyproject.toml            uv project "scouter", ruff + mypy + pytest config
  alembic.ini, migrations/  schema migrations
  Dockerfile
  src/scouter/
    config.py               Settings (pydantic-settings, env vars)
    models.py               Pydantic domain models shared by every layer
    vocab.yaml, vocab.py    canonical skill vocabulary + normalizer
    profile.yaml            seed profile (from zangeel.dev/cv)
    profile.py              load/seed/version the profile
    scoring.py              deterministic power level
    filters.py              region, seniority, student, defense
    dedupe.py               URL + (company,title)+similarity dedupe
    http.py                 polite shared httpx client (UA, per-host delay, cache)
    collectors/{base,freehire,greenhouse,lever,comeet,paste}.py
    discovery.py            company → public board discovery
    extract/{graph,llm,quotes}.py   LangGraph extraction agent
    embed.py, search.py     embeddings + Elasticsearch
    db.py, repo.py          SQLAlchemy tables + repository functions
    pipeline.py             run_scan()
    api.py                  FastAPI app
    alerts.py               Telegram
    scheduler.py            APScheduler entry point + catch-up
  tests/ (mirrors src; fixtures/ holds saved HTML/JSON)
evals/  jobs/, labels.yaml, pick.py, label.py, run.py
docker-compose.yml, .env.example
docs/ops.md                 running on the Mac, Tailscale, Telegram setup
```

---

### Task 1: Backend scaffold, config, domain models, CI

**Files:**
- Create: `backend/pyproject.toml`, `backend/src/scouter/__init__.py`, `backend/src/scouter/config.py`, `backend/src/scouter/models.py`, `backend/tests/test_models.py`, `.github/workflows/backend.yml`, `.env.example`
- Modify: `.gitignore` (add `.env`, `backend/.venv/`, `backend/src/scouter/profile.local.yaml`, `__pycache__/`)

**Interfaces:**
- Produces (`scouter.models`, all Pydantic v2, serialized with camelCase aliases via `alias_generator=to_camel, populate_by_name=True`):
  - `Requirement(text: str, priority: Literal['required','preferred'])`
  - `RawJob(source: str, source_id: str, url: str, title: str, company: str, location: str | None, work_mode: Literal['onsite','hybrid','remote'] | None, posted_at: datetime | None, seniority: str | None, text: str, requirements: list[Requirement] = [], language: Literal['en','he'] = 'en')`
  - `Evidence(quote: str, display: str, source: Literal['post','freehire'])`
  - `RequirementItem(skills: list[str], any_of: bool, evidence: Evidence)`: canonical skill ids; empty `skills` = unrecognised requirement
  - `Education(degree_required: bool, gpa_required: bool, evidence: Evidence | None)`
  - `JobProfile(must_have: list[RequirementItem], nice_to_have: list[RequirementItem], min_years_experience: float | None, years_evidence: Evidence | None, seniority: Literal['intern','junior','mid','senior+','unknown'], education: Education | None, work_mode: ... | None, is_defense: bool, defense_evidence: Evidence | None, study_years_left_required: float | None)`
  - `ScoreLine`, `Score`, `Job`, `Application`, `Stage`, mirroring `frontend/src/domain/types.ts` field for field (`trainGain`, `trainLabel` optional; `Application` adds optional `contact: str = ''`, `cvVersion: str = ''`).
  - `Settings` (`scouter.config.get_settings()`, cached): `database_url`, `elastic_url`, `anthropic_api_key`, `model_default='claude-sonnet-5-5'`, `model_cheap='claude-haiku-5-5'`, `telegram_bot_token`, `telegram_chat_id`, `public_app_url`, `scouter_token`, `scan_hour=7`, `timezone='Asia/Jerusalem'`. All secrets default to `None`.

- [ ] **Step 1:** `uv init --package --name scouter backend`, then `uv python pin 3.13` and `uv add fastapi uvicorn pydantic pydantic-settings sqlalchemy alembic psycopg[binary] httpx selectolax rapidfuzz pyyaml langgraph anthropic apscheduler elasticsearch`, `uv add --dev ruff mypy pytest pytest-asyncio respx types-PyYAML`. Embeddings go in an optional group: `uv add --optional search sentence-transformers`. Configure ruff (line length 120, rules `E,F,I,UP,B`) and mypy (`strict = true`, `plugins = ["pydantic.mypy"]`).
- [ ] **Step 2: Write the failing test** `tests/test_models.py`:
  - `test_job_serializes_camel_case`: a `Job` dumped with `by_alias=True` has keys `workMode`, `postedAt`, `foundAt`, and its score lines have `trainGain`.
  - `test_score_line_round_trips_frontend_fixture`: every entry in `frontend/src/data/fixtures/jobs.json` validates as `Job` and dumps back equal (`exclude_none=True`).
- [ ] **Step 3:** Run `cd backend && uv run pytest tests/test_models.py -v`. Expected: FAIL, `ModuleNotFoundError: scouter.models`.
- [ ] **Step 4:** Implement `config.py` and `models.py` per Interfaces.
- [ ] **Step 5:** Run the tests again. Expected: PASS (2).
- [ ] **Step 6:** CI `backend.yml`: on push/PR touching `backend/**`: `astral-sh/setup-uv`, `uv sync --frozen`, `uv run ruff check`, `uv run ruff format --check`, `uv run mypy src`, `uv run pytest -m "not db"`, plus a second job with a `postgres:16` service running `uv run pytest -m db` with `DATABASE_URL` set. Register the `db` marker in `pyproject.toml`.
- [ ] **Step 7: Commit** (`backend/ .github/workflows/backend.yml .env.example .gitignore`): "Scaffold Python backend with config and domain models".

---

### Task 2: Canonical skill vocabulary

**Files:**
- Create: `backend/src/scouter/vocab.yaml`, `backend/src/scouter/vocab.py`, `backend/tests/test_vocab.py`

**Interfaces:**
- Produces: `skills_in(text: str) -> list[str]` (canonical ids in first-seen order, deduped), `label(skill: str) -> str`, `is_any_of(text: str) -> bool` (true when the line lists alternatives: `\bor\b` or `/`), `canonical(phrase: str) -> str | None` (alias lookup, case-insensitive).
- `vocab.yaml` shape: `- id: nodejs\n  label: Node.js\n  pattern: 'node(\.?js)?\b'\n  aliases: [node, nodejs, node.js]`. Seed it with every entry of `VOCAB` in `frontend/scripts/build-fixtures.mjs`, same ids, labels and regexes. Hebrew aliases are allowed in `aliases`.

- [ ] **Step 1: Write the failing tests:**
  - `test_node_variants_normalize`: `canonical(x) == 'nodejs'` for `Node`, `NodeJS`, `Node.js`.
  - `test_react_not_react_native`: `skills_in('React Native apps') == ['react-native']`, `skills_in('React and Redux') == ['react']`.
  - `test_javascript_not_java`: `skills_in('JavaScript') == ['javascript']`.
  - `test_or_list`: `is_any_of('Python or Go') is True`, `is_any_of('Python, Go and SQL') is False`.
  - `test_fixture_parity`: for each `jobs.json` line with `skill`, the line's `evidence.quote` yields that skill from `skills_in`.
- [ ] **Step 2:** Run `uv run pytest tests/test_vocab.py -v`. Expected: FAIL (import error).
- [ ] **Step 3:** Implement `vocab.py`: load YAML once at import, compile patterns with `re.I`.
- [ ] **Step 4:** Run again. Expected: PASS (5).
- [ ] **Step 5: Commit:** "Add canonical skill vocabulary".

---

### Task 3: Profile seed and versioning

**Files:**
- Create: `backend/src/scouter/profile.yaml`, `backend/src/scouter/profile.py`, `backend/tests/test_profile.py`

**Interfaces:**
- Produces: `Profile(version: int, years_experience: float, skills: dict[str, Literal['proven','used','learning']], degree: Literal['in_progress','completed'], months_to_graduation: int, show_hidden_regions: bool = False, show_senior: bool = False, excluded_companies: list[str])` in `scouter.models`. `load_seed() -> Profile` reads `profile.yaml` and overlays `profile.local.yaml` when present (deep merge, `skills` merged by key).
- Seed values: `years_experience: 2`, `degree: in_progress`, `months_to_graduation: 3`, skills exactly the `PROFILE.skills` map in `frontend/scripts/build-fixtures.mjs`, `excluded_companies`: Elbit, Rafael, IAI, Israel Aerospace Industries, Elta, Xtend, Sentrycs, Mobileye, Israel Shipyards, Tomer, Plasan, BIRD Aerosystems, UVision, Smart Shooter, Controp.

- [ ] **Step 1: Write the failing tests:** `test_seed_matches_fixture_profile` (skills equal to the fixture scorer's map), `test_local_overlay_merges_skills` (tmp `profile.local.yaml` with `python: used` changes only `python`), `test_unknown_level_rejected` (`skills: {go: expert}` raises `ValidationError`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (3).
- [ ] **Step 5: Commit:** "Seed Nour's profile from the CV".

---

### Task 4: Deterministic scorer

**Files:**
- Create: `backend/src/scouter/scoring.py`, `backend/tests/test_scoring.py`

**Interfaces:**
- Consumes: `JobProfile`, `Profile`, `vocab.label`.
- Produces: `score(job: JobProfile, profile: Profile, region_label: str) -> Score` and `LEVEL = {'proven': 1.0, 'used': 0.7, 'learning': 0.3}`.
- Port `score()` from `frontend/scripts/build-fixtures.mjs`, with these exact values: skill budget 10,000 split `MUST=8500 / NICE=1500` when both kinds exist, all to one kind otherwise; per item = budget / item count; `any_of` items take the best-matched skill, others average and train the weakest; `trainGain = round(per) - points` only when level < 1; unrecognised items get a 0-point line labelled `Unrecognised: <first 46 chars>…`. Seniority: intern/junior/unknown 0, mid −800, senior+ −3000. Experience: −1600 per year above `profile.years_experience`. Education: degree required and `degree == 'in_progress'` → −300 ("Degree required: partly met (final semester)"), −600 with a GPA requirement; 0 and "Degree: met" when `completed`. Location line 0 points with `region_label`. Total = max(0, sum).

- [ ] **Step 1: Write the failing tests:**
  - `test_three_years_cannot_exceed_9000`: a profile with every must-have `proven`, no nice-to-haves, `min_years_experience=3` → `total <= 9000`.
  - `test_every_hard_requirement_has_a_line`: 4 must-haves (one unrecognised) → 4 `must` lines.
  - `test_or_takes_best_and_takes_weakest`: `['python','nodejs']` any_of → points of `nodejs` (proven); all-of → average, `skill == 'python'`.
  - `test_train_gain_reaches_full_points`: for a `learning` skill, `points + trainGain == round(per)`.
  - `test_degree_partly_met_until_completed`: −300 in progress, 0 completed.
  - `test_matches_fixture_totals`: for the 20 fixture jobs, build `JobProfile`s with a helper `profile_from_fixture_lines` (in the test) and assert `score(...).total` equals the fixture `total` within ±1.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `score`.
- [ ] **Step 4:** Run. Expected: PASS (6).
- [ ] **Step 5: Commit:** "Port the honest scorer to Python".

---

### Task 5: Filters

**Files:**
- Create: `backend/src/scouter/filters.py`, `backend/tests/test_filters.py`

**Interfaces:**
- Produces: `HiddenReason = Literal['senior','region','student']`, `region_of(location: str | None) -> Literal['north','center','jerusalem','south','remote-il','abroad','unknown']`, `region_label(region) -> str` ("North: in your region" / "Center: in your region" / …), `is_excluded_company(company: str, profile: Profile) -> bool` (case-insensitive, matches suffixes like `-internal`), `hidden_reason(raw: RawJob, jp: JobProfile, profile: Profile) -> HiddenReason | None`, `drop_reason(raw, jp, profile) -> Literal['defense','abroad'] | None`.
- Rules: `north` = Haifa, Yokneam, Nazareth, Akko/Acre, Karmiel, Nahariya, Afula, Tiberias, Safed, Caesarea, Hadera, Zichron Yaakov, Galilee, Migdal HaEmek, Tirat Carmel; `center` = Tel Aviv, Herzliya, Ramat Gan, Petah Tikva, Ra'anana, Kfar Saba, Netanya, Holon, Bnei Brak, Rishon LeZion, Rehovot, Ness Ziona, Yavne, Hod HaSharon, Givatayim, Rosh HaAyin, Lod, Ramla, Modi'in, Or Yehuda, Airport City; `jerusalem`, `south` (Be'er Sheva, Ashdod, Ashkelon, Kiryat Gat, Eilat, Dimona) hidden unless `show_hidden_regions`; `abroad` dropped; bare "Israel" = `remote-il`. Senior hidden unless `show_senior`. Student hidden when `study_years_left_required >= 1.5`. Defense dropped when the company is excluded or `jp.is_defense`.

- [ ] **Step 1: Write the failing tests:** one parametrized table per rule (`test_region_of`, with Hebrew `חיפה` → north and `ירושלים` → jerusalem), `test_jerusalem_hidden_by_default_shown_with_toggle`, `test_defense_dropped_by_list_and_by_flag`, `test_student_needing_two_years_hidden`, `test_senior_hidden_not_dropped`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit:** "Add region, seniority, student and defense filters".

---

### Task 6: Database schema and repository

**Files:**
- Create: `docker-compose.yml` (service `db` only for now: `postgres:16`, volume `pgdata`, port `5432`), `backend/alembic.ini`, `backend/migrations/`, `backend/src/scouter/db.py`, `backend/src/scouter/repo.py`, `backend/tests/conftest.py`, `backend/tests/test_repo.py`

**Interfaces:**
- Tables: `jobs(id text pk, source, source_id, url unique, title, company, location, city, work_mode, posted_at, found_at, last_seen_at, seniority, text, requirements jsonb, content_hash, status text check in ('pending','scored'), hidden_reason null)`, `job_profiles(content_hash pk, model, data jsonb, created_at)`, `scores(job_id fk, profile_version, total int, lines jsonb, pk(job_id, profile_version))`, `profiles(version serial pk, data jsonb, created_at)`, `applications(id pk, job_id fk, stage, history jsonb, notes, contact, cv_version, updated_at)`, `runs(id serial pk, started_at, finished_at, per_source jsonb, new_jobs, new_matches, top_score, dropped jsonb, alerts_failed int, error text)`, `boards(company, provider, token, discovered_at, last_ok_at, failures int, pk(provider, token))`, `events(id serial, type, payload jsonb, at)`.
- Produces in `repo.py` (each takes `session: Session` first): `upsert_job(raw: RawJob, job_id: str, now: datetime) -> tuple[str, bool]` (id, is_new; refreshes `last_seen_at`, never deletes), `get_profile_cache(content_hash) -> JobProfile | None`, `put_profile_cache(content_hash, model, jp)`, `save_score(job_id, version, score)`, `current_profile() -> Profile` (seeds from `load_seed()` on an empty table), `save_profile(p: Profile) -> Profile` (new version), `list_jobs(since_found_at: datetime | None, min_score: int | None, include_hidden: bool) -> list[Job]` (score for the current profile version, sorted by total desc), `get_job(id) -> Job | None`, `list_applications()`, `apply(job_id) -> Application` (idempotent), `update_application(id, stage=None, notes=None, contact=None, cv_version=None) -> Application`, `record_event(type, payload)`, `start_run() -> int`, `finish_run(id, summary: RunSummary)`, `latest_run() -> RunSummary | None`.
- `RunSummary` in `models.py`: `startedAt, finishedAt, perSource: dict[str, SourceResult(found:int, new:int, failed:bool, error:str|None)], newJobs, newMatches, topScore, dropped: dict[str,int], alertsFailed: int`.
- `job_id`: `slugify(f"{title}-{company}")` + `-` + first 8 hex of sha1(url).

- [ ] **Step 1:** `conftest.py`: a `session` fixture (marker `db`) that creates a fresh schema via `alembic upgrade head` on `DATABASE_URL` and rolls back after each test.
- [ ] **Step 2: Write the failing tests** (all `@pytest.mark.db`): `test_upsert_is_idempotent_by_url`, `test_seen_again_refreshes_last_seen_not_found_at`, `test_apply_twice_returns_same_application`, `test_stage_change_appends_history_and_event`, `test_profile_save_bumps_version`, `test_list_jobs_hides_hidden_unless_asked`.
- [ ] **Step 3:** Run `docker compose up -d db && DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres uv run pytest -m db -v`. Expected: FAIL.
- [ ] **Step 4:** Implement `db.py` (SQLAlchemy 2 typed models), the initial Alembic migration (`alembic revision --autogenerate -m "initial schema"`, then read it), and `repo.py`.
- [ ] **Step 5:** Run again. Expected: PASS (6).
- [ ] **Step 6: Commit:** "Add Postgres schema, migrations and repository".

---

### Task 7: Polite HTTP client and FreeHire collector

**Files:**
- Create: `backend/src/scouter/http.py`, `backend/src/scouter/collectors/base.py`, `backend/src/scouter/collectors/freehire.py`, `backend/tests/fixtures/freehire_fullstack_p1.html`, `backend/tests/fixtures/freehire_changed.html`, `backend/tests/collectors/test_freehire.py`

**Interfaces:**
- `http.py`: `polite_client() -> httpx.Client` with the UA from Global Constraints, 20 s timeout, and a transport wrapper that sleeps so each host gets ≥1 s between requests.
- `base.py`: `class CollectorError(Exception)`, `class Collector(Protocol): name: str; def collect(self, client: httpx.Client) -> list[RawJob]`.
- `freehire.py`: `parse_page(html: str, role: str) -> list[RawJob]` (port of `frontend/scripts/fetch-freehire.mjs`: split on `{public_slug:"`, read `title`, `company`, `location`, `seniority`, `work_mode`, `posted`, `url`, `requirements[{text,priority}]`; `text` = requirement lines joined with newlines plus `enrichment.summary`), `FreeHireCollector(roles=('fullstack','backend','frontend'), max_pages=10)`: stops at the first page with no jobs **after** page 1; raises `CollectorError` when page 1 is a 200 with no `public_slug` markers.

- [ ] **Step 1:** Save one real page: `curl -A "darb-scouter/0.1 (personal job scout; github.com/b14ckPanther)" "https://freehire.me/roles/fullstack/israel?page=1" -o backend/tests/fixtures/freehire_fullstack_p1.html` (one request, allowed). Create `freehire_changed.html` as a minimal 200 page without markers.
- [ ] **Step 2: Write the failing tests:** `test_parses_saved_page` (≥10 jobs, every job has a title, company and ≥1 requirement, priorities ⊂ {required, preferred}), `test_unchanged_slug_is_source_id`, `test_format_change_fails_loudly` (respx mocks page 1 with `freehire_changed.html` → `CollectorError`), `test_stops_after_empty_page` (respx: page 1 real, page 2 empty → 2 requests total).
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run. Expected: PASS (4).
- [ ] **Step 6: Commit:** "Add polite HTTP client and FreeHire collector".

---

### Task 8: Greenhouse, Lever and Comeet collectors with company discovery

**Files:**
- Create: `backend/src/scouter/collectors/{greenhouse,lever,comeet}.py`, `backend/src/scouter/discovery.py`, `backend/src/scouter/boards.yaml`, fixtures `greenhouse_jobs.json`, `lever_postings.json`, `comeet_positions.json`, tests `tests/collectors/test_ats.py`, `tests/test_discovery.py`

**Interfaces:**
- Each ATS module: `parse(payload: dict | list, company: str) -> list[RawJob]` and `fetch(client, token: str, company: str) -> list[RawJob]`. Endpoints: Greenhouse `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (HTML `content` → text with selectolax), Lever `https://api.lever.co/v0/postings/{token}?mode=json`, Comeet `https://www.comeet.co/careers-api/2.0/company/{uid}/positions?token={token}&details=true`. Comeet `token` is stored as `"{uid}:{token}"`.
- `discovery.py`: `candidate_slugs(company: str) -> list[str]` (lowercased, spaces removed / hyphenated, suffixes like ` ltd`, ` inc`, `-internal` stripped), `discover(client, company: str) -> list[Board]` (probes Greenhouse and Lever slugs, a 200 with ≥1 job wins; Comeet via a `comeet` UID/token scraped from the company careers page when its URL is known), `ATSCollector(boards: list[Board])` that fetches every known board; a failing board raises inside a per-board try and is reported as `failures += 1` on that board, and the collector raises `CollectorError` only when every board failed.
- `Board(company: str, provider: Literal['greenhouse','lever','comeet'], token: str)` in `models.py`. `boards.yaml` seeds known Israeli boards (start with the FreeHire companies whose apply URLs already point at `greenhouse.io`, `lever.co` or `comeet.com` in `frontend/src/data/fixtures/raw.json`; extract them with a one-off script, no live requests).

- [ ] **Step 1: Write the failing tests:** `test_greenhouse_parse` / `test_lever_parse` / `test_comeet_parse` against the saved JSON (title, url, location, text non-empty); `test_candidate_slugs` (`"Check Point Software Ltd"` → includes `checkpoint`, `check-point`); `test_discover_greenhouse_hit` (respx: greenhouse slug 200 with jobs, lever 404 → one Board); `test_one_board_failing_does_not_fail_collector`; `test_all_boards_failing_raises`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; record the saved fixtures from the vendors' public documentation examples (no live calls).
- [ ] **Step 4:** Run. Expected: PASS (7).
- [ ] **Step 5: Commit:** "Add Greenhouse, Lever and Comeet collectors with board discovery" (may be split into one commit per provider).

---

### Task 9: Paste-a-link collector

**Files:**
- Create: `backend/src/scouter/collectors/paste.py`, `backend/tests/collectors/test_paste.py`, fixture `careers_page.html`

**Interfaces:**
- `from_url(client, url: str) -> RawJob | NeedsText` and `from_text(url: str, text: str, title: str, company: str) -> RawJob`. `NeedsText(reason: str)` is returned (not raised) for `linkedin.com` URLs (never fetched), non-2xx responses, and pages whose main text is under 400 chars. Text extraction: selectolax, drop `script/style/nav/header/footer`, take the largest text block; title from `og:title` or `<title>`, company from `og:site_name`. Hebrew detected when ≥30% of letters are in U+0590–U+05FF → `language='he'`.

- [ ] **Step 1: Write the failing tests:** `test_linkedin_never_fetched` (respx asserts no request, returns `NeedsText`), `test_careers_page_extracts_text`, `test_blocked_page_asks_for_text` (403 → `NeedsText`), `test_hebrew_detected`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (4).
- [ ] **Step 5: Commit:** "Add paste-a-link collector".

---

### Task 10: Deduplication

**Files:**
- Create: `backend/src/scouter/dedupe.py`, `backend/tests/test_dedupe.py`

**Interfaces:**
- `norm_company(s) -> str`, `norm_title(s) -> str` (lowercase, strip seniority words, parentheses, punctuation), `dedupe(jobs: list[RawJob]) -> list[RawJob]`: first by `url` (query string stripped of `utm_*`); then same `norm_company` and `rapidfuzz.fuzz.token_set_ratio(norm_title) >= 90` and `fuzz.token_set_ratio(text[:2000]) >= 80` → keep one, preferring an ATS source over FreeHire (ATS posts carry the full text), and merging FreeHire's `requirements` into the kept job.

- [ ] **Step 1: Write the failing tests:** `test_same_url_with_utm_is_one`, `test_freehire_and_greenhouse_same_job_merge` (titles "Junior Full Stack Developer" vs "Full Stack Developer (Junior)" → one job, source greenhouse, requirements from FreeHire), `test_same_title_different_company_kept`, `test_same_company_different_roles_kept`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (4).
- [ ] **Step 5: Commit:** "Deduplicate jobs across sources".

---

### Task 11: LangGraph extraction agent

**Files:**
- Create: `backend/src/scouter/embed.py` (the `Embedder` Protocol only; Task 13 adds the real model), `backend/src/scouter/extract/quotes.py`, `backend/src/scouter/extract/llm.py`, `backend/src/scouter/extract/graph.py`, `backend/src/scouter/extract/prompt.md`, tests `tests/extract/test_quotes.py`, `tests/extract/test_graph.py`

**Interfaces:**
- `quotes.py`: `normalize(s: str) -> str` (NFC; strip U+200E, U+200F, U+202A–U+202E, U+2066–U+2069; NBSP → space; collapse whitespace; casefold), `verify(quote: str, text: str) -> bool` = `normalize(quote) in normalize(text)`.
- `llm.py`: `class LLM(Protocol): def extract(self, text: str, requirements: list[Requirement], model: str) -> LLMDraft`. `AnthropicLLM` implements it with the Anthropic SDK using a single forced tool whose `input_schema` is `LLMDraft.model_json_schema()`, validated by Pydantic. `LLMDraft` = `JobProfile` with raw skill phrases instead of canonical ids, and every item's `evidence.quote` in the post's language plus an English `display`.
- `graph.py`: `build_graph(llm: LLM, embedder: Embedder | None) -> CompiledGraph` with nodes `draft → verify_quotes → normalize_skills → finalize`; `extract_profile(raw: RawJob, llm, embedder=None, model: str) -> tuple[JobProfile, list[str]]` (profile, list of dropped-item log lines). `verify_quotes` drops items whose quote fails `verify` against `raw.text` (and FreeHire requirement lines, labelling `source='freehire'` when the quote came from those). `normalize_skills` maps phrases through `vocab.canonical`, then `vocab.skills_in`, then (if `embedder`) nearest vocab label with cosine ≥ 0.85; anything left becomes an unrecognised item (`skills=[]`). When `raw.requirements` is non-empty the prompt tells the model to normalize those lines rather than free text.
- `content_hash(raw) = sha256(model + "\n" + raw.text + "\n" + json(requirements))`.
- `prompt.md` says: extract only what the post states, quote verbatim, never infer skills, set `is_defense` only on explicit evidence (security clearance, IDF/MOD projects, defense customers), and output English `display` text.

- [ ] **Step 1: Write the failing tests:**
  - `test_quote_survives_bidi_and_nbsp`: `verify('ניסיון ב-React', 'דרישות:‏ ניסיון ב-React\n')` is True.
  - `test_invented_quote_dropped`: a `FakeLLM` returns a must-have with a quote not in the text → not in the profile, one dropped log line.
  - `test_aliases_become_canonical`: draft skill "NodeJS" → `['nodejs']`.
  - `test_unknown_phrase_kept_as_unrecognised`.
  - `test_defense_flag_requires_evidence`: `is_defense=True` with an unverifiable quote → `is_defense` False.
  - `test_freehire_quotes_labelled`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Add one `@pytest.mark.live` test (`test_live_extraction_smoke`, skipped unless `ANTHROPIC_API_KEY` is set) that extracts one saved FreeHire job; CI never runs it.
- [ ] **Step 4:** Run `uv run pytest tests/extract -v -m "not live"`. Expected: PASS (6).
- [ ] **Step 5: Commit:** "Add LangGraph requirement extractor with verbatim-quote check".

---

### Task 12: Scan pipeline

**Files:**
- Create: `backend/src/scouter/pipeline.py`, `backend/tests/test_pipeline.py`

**Interfaces:**
- `class Indexer(Protocol): def index(self, job: Job, text: str) -> None` lives in `pipeline.py` (Task 13 implements it as `EsIndexer`).
- `run_scan(session, collectors: list[Collector], llm: LLM, indexer: Indexer | None, now: datetime, alert: Callable[[RunSummary, list[Job]], int] | None = None) -> RunSummary`.
- Order: `start_run` → each collector inside its own try (`CollectorError` and any exception → `SourceResult(failed=True, error=str(e))`) → `dedupe` → drop `abroad` and excluded companies before extraction → upsert → for each job with `status='pending'` (new jobs and earlier failures): profile from cache or `extract_profile`; on LLM exception leave it `pending` and count `perSource[source].error`; `drop_reason == 'defense'` → delete the not-yet-applied job row and count `dropped['defense']`; else set `hidden_reason`, `score`, `save_score`, `status='scored'` → index → `newMatches` = new jobs with total > 9000 → `alert(summary, matches)` returns number of failed sends (exceptions also count as failures) → `finish_run`.
- `rescore_all(session) -> int`: rescoring every scored job against `current_profile()` from cached profiles, no LLM calls.

- [ ] **Step 1: Write the failing tests** (`db` marker, fake collectors and `FakeLLM`): `test_one_collector_failing_others_still_run`, `test_defense_job_dropped_and_counted`, `test_llm_down_leaves_job_pending_then_scores_next_run`, `test_cached_profile_not_re_extracted` (FakeLLM call count stays 1 across two runs), `test_job_gone_from_source_survives` (applied job missing from the second run is still returned by `get_job`), `test_alert_failure_does_not_fail_run` (alert raises → `alertsFailed == 1`, run finished), `test_rescore_after_profile_change` (changing `python` to `proven` raises a Python job's total without LLM calls).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (7).
- [ ] **Step 5: Commit:** "Add daily scan pipeline with per-source failure isolation".

---

### Task 13: Embeddings and Elasticsearch hybrid search

**Files:**
- Create: `backend/src/scouter/embed.py`, `backend/src/scouter/search.py`, `backend/tests/test_search.py`
- Modify: `docker-compose.yml` (add `es`: `docker.elastic.co/elasticsearch/elasticsearch:8.15.3`, `discovery.type=single-node`, `xpack.security.enabled=false`, `ES_JAVA_OPTS=-Xms512m -Xmx512m`)

**Interfaces:**
- Consumes: `Embedder` Protocol from Task 11 (`dim: int; encode(texts: list[str]) -> list[list[float]]`) and `Indexer` Protocol from Task 12. `E5Embedder` loads `intfloat/multilingual-e5-small` (dim 384) lazily, prefixing `passage: ` / `query: ` as the model expects.
- `class EsIndexer` (implements `Indexer`): `ensure_index()` (index `jobs`, mappings: `title`/`company`/`text` text fields, `vector` dense_vector 384 cosine, keyword `source`, `seniority`, `workMode`, `stage`, integer `score`, date `foundAt`), `index(job: Job, text: str)`, `search(q: str, filters: SearchFilters, k=50) -> list[str]` (job ids). Hybrid = `bool.should` BM25 `multi_match` on title^3, company^2, text plus a `knn` clause (num_candidates 100), combined with ES's `rank` RRF when available, otherwise a client-side reciprocal-rank fusion (k=60). `SearchFilters(min_score, max_score, stage, source, seniority, work_mode, since)`.

- [ ] **Step 1: Write the failing tests:** `test_rrf_merges_rankings` (pure function `rrf(lists, k=60)`), `test_filters_build_query` (pure: `build_query` output contains a `range` on `score`), and `@pytest.mark.es` `test_hebrew_query_finds_english_job` (indexes 3 jobs with a `FakeEmbedder` that maps "מפתח" and "developer" to the same vector; skipped unless `ELASTIC_URL` is set; CI adds an ES service for this marker).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit:** "Add multilingual embeddings and hybrid Elasticsearch search".

---

### Task 14: FastAPI app

**Files:**
- Create: `backend/src/scouter/api.py`, `backend/tests/test_api.py`

**Interfaces (all under `/api`, JSON camelCase):**
- `GET /health` → `{ok: true}` (never guarded).
- `GET /jobs?sinceFoundAt&minScore&includeHidden` → `Job[]`; `GET /jobs/{id}` → `Job` or 404; `GET /jobs/search?q&minScore&maxScore&stage&source&seniority&workMode&since` → `Job[]` (falls back to SQL `ILIKE` on title/company when ES is down, with response header `X-Search-Fallback: 1`).
- `POST /jobs/paste {url, text?, title?, company?}` → `201 Job` or `422 {needsText: true, reason}`; runs extraction + scoring for that one job synchronously.
- `GET /runs/latest` → `RunSummary` or 404; `POST /runs` → `202`, starts `run_scan` in a background thread unless one is running (`409`).
- `GET /applications`, `POST /applications {jobId}` → `Application`; `PATCH /applications/{id} {stage?, notes?, contact?, cvVersion?}`.
- `GET /profile`, `PUT /profile` → saves a new version, calls `rescore_all`, returns the profile.
- Guard: when `settings.scouter_token` is set, every route except `/health` and static files needs header `X-Scouter-Token` equal to it (`401` otherwise; compare with `hmac.compare_digest`).
- Serves `frontend/dist` at `/` with SPA fallback to `index.html` when the directory exists.

- [ ] **Step 1: Write the failing tests** (`db` marker, `TestClient`): `test_jobs_shape_matches_frontend` (keys of the first job equal the `Job` type's keys), `test_paste_linkedin_asks_for_text`, `test_token_guard` (401 without, 200 with, `/api/health` open), `test_profile_put_rescores`, `test_second_scan_conflicts`, `test_search_falls_back_when_es_down`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (6).
- [ ] **Step 5: Commit:** "Add FastAPI service for jobs, scans, applications and profile".

---

### Task 15: Scheduler, catch-up on wake, Telegram alerts

**Files:**
- Create: `backend/src/scouter/alerts.py`, `backend/src/scouter/scheduler.py`, `backend/tests/test_alerts.py`, `backend/tests/test_scheduler.py`

**Interfaces:**
- `alerts.py`: `format_match(job: Job, app_url: str) -> str` (e.g. `"⚡ 9,320 · Junior Backend Developer at Wix, Tel Aviv\n{app_url}/scan/{id}"`), `format_summary(s: RunSummary) -> str` (one line: `"Scouter 07:00 · 14 new jobs · best 8,742 · 1 source failed: comeet"`), `send(text: str) -> None` (POST `https://api.telegram.org/bot{token}/sendMessage`, `chat_id`, `disable_web_page_preview: true`; raises on non-2xx), `telegram_alert(summary, matches) -> int` (sends matches then summary; returns failure count; no-ops returning 0 when token or chat id is unset).
- `scheduler.py`: `due_scan_time(now: datetime, tz, hour) -> datetime` (today's 07:00 if `now` is past it, else yesterday's), `should_catch_up(last_started: datetime | None, now) -> bool` (true when the last run started before `due_scan_time`), `run_once_if_due(session_factory, now) -> bool` guarded by a Postgres advisory lock (`pg_try_advisory_lock(7007)`) and a re-check of `should_catch_up` inside the lock. `main()`: `BlockingScheduler(timezone='Asia/Jerusalem')` with a cron job at `scan_hour:00` (`misfire_grace_time=None`, `coalesce=True`) and an interval job every 10 minutes, both calling `run_once_if_due`; one call at startup. The interval job is the wake detector: APScheduler doesn't see sleep, but the first tick after wake does.

- [ ] **Step 1: Write the failing tests:**
  - `test_due_time_before_and_after_seven` (06:59 → yesterday 07:00; 07:01 → today 07:00).
  - `test_woke_at_0930_runs_exactly_once`: call `run_once_if_due` from the cron path and the interval path at 09:30 (sequentially and from two threads) with a last run yesterday → `run_scan` called once (`db` marker).
  - `test_no_run_when_today_done`.
  - `test_summary_line` and `test_match_message_has_link`.
  - `test_telegram_down_counts_failure` (respx 502 → returns 2 for one match + summary, no exception).
  - `test_alerts_disabled_without_token`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (7).
- [ ] **Step 5: Commit:** "Schedule the 07:00 scan with catch-up on wake and Telegram alerts".

---

### Task 16: Full Docker Compose stack and Mac/Tailscale runbook

**Files:**
- Create: `backend/Dockerfile`, `docs/ops.md`
- Modify: `docker-compose.yml`, `.env.example`

**Interfaces:**
- `Dockerfile`: multi-stage. A `node:22` stage builds `frontend/dist`. A `python:3.13-slim` stage runs `uv sync --frozen --extra search`, copies `dist` and runs as a non-root user. Default command: `alembic upgrade head && uvicorn scouter.api:app --host 0.0.0.0 --port 8000`.
- Compose services: `db`, `es`, `api` (port `8000:8000`, `env_file: .env`), `scheduler` (same image, `command: python -m scouter.scheduler`), all `restart: unless-stopped`, healthchecks on `db` and `es`, `api` depends on healthy `db`.
- `docs/ops.md`:
  - Start Docker Desktop at login, then `docker compose up -d --build`.
  - Create the Telegram bot with @BotFather, and get the chat id from `getUpdates`.
  - Install Tailscale on the Mac and the phone, then `tailscale serve --bg 8000`. `PUBLIC_APP_URL` is the `https://<mac>.<tailnet>.ts.net` URL. Nothing is exposed publicly (no Funnel).
  - Set `SCOUTER_TOKEN`. The phone stores it once in Settings.
  - Back up with `pg_dump`.

- [ ] **Step 1:** Write a compose smoke script `scripts/smoke.sh`. It runs `docker compose up -d --build`, waits until `curl -fs localhost:8000/api/health` succeeds (90 s limit), then checks that `curl -fs localhost:8000/` returns HTML containing `<div id="root">`.
- [ ] **Step 2:** Run it. Expected: FAIL (no Dockerfile).
- [ ] **Step 3:** Implement the Dockerfile, compose and docs.
- [ ] **Step 4:** Run `scripts/smoke.sh`. Expected: both checks pass. Then `docker compose run --rm api python -c "from scouter.scheduler import main"` exits 0.
- [ ] **Step 5: Commit:** "Run the whole stack in Docker Compose and document Mac setup".

---

### Task 17: Frontend on the real API

**Files:**
- Modify: `frontend/src/data/api.ts`, `frontend/src/data/api.test.ts`, `frontend/src/screens/RadarScreen.tsx`, `frontend/src/screens/LogScreen.tsx`, `frontend/src/screens/SettingsScreen.tsx`, `frontend/src/screens/JourneyScreen.tsx`, their tests, `frontend/src/domain/types.ts`
- Create: `frontend/src/data/http.ts`, `frontend/src/ui/PasteLink.tsx`, `frontend/src/data/fixtures/run.json`

**Interfaces:**
- `api.ts` keeps every existing export and signature. A `mode` is `'http'` when `import.meta.env.VITE_API_URL` is defined (empty string = same origin), otherwise `'fixtures'`. Production builds set `VITE_API_URL=""`. Vitest and the README demo keep fixtures. New exports:
  - `getLastRun(): Promise<RunSummary | null>`
  - `searchJobs(q: string, f?: SearchFilters): Promise<Job[]>`
  - `pasteLink(input: {url: string; text?: string; title?: string; company?: string}): Promise<{job: Job} | {needsText: true; reason: string}>`
  - `getProfile()`, `saveProfile(p: Profile)`
  - `updateApplication(id, patch)`
  - `moveStage` stays as a wrapper over `updateApplication`.
- `http.ts`: `request<T>(path, init?)` adds `X-Scouter-Token` from `localStorage['scouter.token']` when present. A 401 throws `AuthError`, which Settings catches to show a token field.
- `types.ts` adds `RunSummary`, `SourceResult`, `Profile` and `SearchFilters`, mirroring the backend.
- Radar shows failed sources from `getLastRun()` as a visible line under the summary ("Comeet scan failed: <error>"), so a broken collector is never silent (§4).
- Log gets a `PasteLink` form ("Scan a link"). It switches to a textarea when `needsText` comes back. Search uses `searchJobs` in http mode and the existing client-side filter in fixture mode.
- Settings edits the profile skills and levels, the degree status, and the region/senior toggles through `saveProfile`, in place of its localStorage-only settings. Sound and the token stay local.

- [ ] **Step 1: Write the failing tests:**
  - `api.test.ts` `http mode sends the token and maps jobs` (stub `fetch`; assert URL `/api/jobs` and the header).
  - `RadarScreen.test.tsx` `shows a failed source` (fixture `run.json` with a failed `comeet`).
  - `LogScreen.test.tsx` `asks for pasted text when a link is blocked`.
  - `SettingsScreen.test.tsx` `saving a skill level calls saveProfile`.
- [ ] **Step 2:** Run `cd frontend && npx vitest run`. Expected: the 4 new tests FAIL and the 72 existing ones pass.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run` and `PWEXE=$(find ~/Library/Caches/ms-playwright/chromium_headless_shell-1246 -name chrome-headless-shell -type f | head -1) npx playwright test`. Expected: 76/76 Vitest, 13/13 Playwright.
- [ ] **Step 5:** Manual: run `docker compose up -d --build`, then `curl -X POST localhost:8000/api/runs`, and open `http://localhost:8000`. The Radar shows real jobs from the first real scan. Take screenshots with `.superpowers/shots/shoot.mjs`.
- [ ] **Step 6: Commit:** "Wire the frontend to the real API". Split it into one commit per screen.

---

### Task 18: Evals

**Files:**
- Create: `evals/pick.py`, `evals/label.py`, `evals/run.py`, `evals/README.md`, `evals/jobs/*.json`, `evals/labels.yaml`, `backend/tests/test_evals.py`
- Modify: `.github/workflows/backend.yml` (adds a cheap eval step)

**Interfaces:**
- `pick.py --n 30`: picks 30 scored jobs from the DB, spread across score deciles and sources, at least 3 Hebrew where available. It writes each job's raw text and cached `JobProfile` to `evals/jobs/<id>.json` (public job-post content only).
- `label.py`: a terminal walkthrough for Nour. It shows each post and asks for a 0–10 fit and the must-haves Nour sees (comma-separated, normalized through `vocab.canonical`), then appends to `labels.yaml` (`<id>: {fit: 7, must: [react, nodejs]}`). It can be resumed.
- `run.py [--live]`:
  - Cheap mode re-scores the cached profiles against `profile.yaml` and reports the Spearman ρ between `total` and `fit`, plus must-have precision/recall of the cached extraction against `labels.yaml`.
  - `--live` re-extracts with the configured model first.
  - Exits non-zero when ρ < 0.5 or recall < 0.7.
- Implement `spearman(xs, ys)` and `prf(pred: set, gold: set)` in `run.py` as pure functions.

- [ ] **Step 1: Write the failing tests:**
  - `test_spearman_known_values`: identical order → 1.0, reversed → −1.0, ties use average ranks.
  - `test_prf_empty_sets`: both empty → (1, 1, 1).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the three scripts.
- [ ] **Step 4:** Run. Expected: PASS. Run `uv run python evals/pick.py --n 30` against the real DB and commit `evals/jobs/`.
- [ ] **Step 5: Nour's step (blocks the rest of this task).** Nour runs `uv run python evals/label.py`, which takes about 45 minutes. Then:
  - run `uv run python evals/run.py` and record ρ and recall in `evals/README.md`.
  - If the gate fails, tune the scorer weights in Task 4's constants and the prompt. Each change is a commit that names the before and after metric.
  - Rerun `pytest tests/test_scoring.py`. `test_matches_fixture_totals` may be updated only together with `build-fixtures.mjs`, so the fixtures stay honest.
- [ ] **Step 6:** Add `uv run python evals/run.py` (cheap mode) to CI.
- [ ] **Step 7: Commit:** "Add eval set and honesty metrics".

---

### Task 19: Public launch

**Files:**
- Modify: `README.md`, `frontend/src/data/fixtures/*` (privacy scrub only if needed)
- Create: `docs/media/demo.gif`, `docs/field-notes/darb-scouter.md`, `.github/workflows/frontend.yml` (unchanged unless the build path moved)

- [ ] **Step 1: Privacy and secrets check.** Every check must pass:
  - `git log --all -p | grep -E "sk-ant-|[0-9]{8,10}:[A-Za-z0-9_-]{35}|SCOUTER_TOKEN=."` returns nothing. These patterns are Anthropic keys and Telegram bot tokens.
  - `git log --format='%an %ae%n%cn %ce' | sort -u` shows only Nour and the GitHub web-flow initial commit.
  - No string in fixtures or evals matches Nour's phone number or email.
  - `profile.local.yaml` was never committed.
- [ ] **Step 2: Demo GIF.** Record a Playwright video of the fixture build: Radar sweep → open the best blip → the Scouter count-up → Train a skill → Journey. Convert it with `ffmpeg -i demo.webm -vf "fps=15,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" docs/media/demo.gif`. Keep it under 8 MB. All visuals in it are the project's own.
- [ ] **Step 3: README.**
  - The GIF goes at the top.
  - "How the score stays honest", covering verbatim quotes, the code-only scorer, and the 3-year test.
  - Architecture diagram from spec §8.
  - "Run it yourself" (compose + `.env`).
  - The eval results from Task 18.
  - An "AI workflow" section, in Nour's voice, describing how Nour used AI tools during development as a workflow (spec, plan, tests first, review). It is a description of process, not an attribution line, and contains no co-author credit.
  - A "Not affiliated with Dragon Ball; all art and sound are original" notice.
- [ ] **Step 4: Field Notes post.** Write `docs/field-notes/darb-scouter.md` as a ~800-word draft for the future Hugo site: what it is, the honesty problem, what the evals showed, and what's next. Nour edits it before it's published anywhere.
- [ ] **Step 5:** Run every check (`uv run pytest`, `npx vitest run`, Playwright, `scripts/smoke.sh`). Expected: all green.
- [ ] **Step 6: Commit:** "Prepare public launch: demo, README and write-up". Then push `main`.
- [ ] **Step 7: Ask Nour before this step.** It's outward-facing and hard to undo. Once Nour says yes, run `gh repo edit b14ckPanther/darb-scouter --visibility public --accept-visibility-change-consequences`, then pin the repo on the profile.

---

## Self-review notes

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | §5.1 sources | 7, 8, 9 |
  | filtering | 5 |
  | dedupe | 10 |
  | §5.2 extraction | 11 |
  | §5.3 profile | 3, plus 14 (edit in Settings) and 12 (rescore) |
  | §5.4 scoring | 4, with semantic fallback in 11 |
  | §5.5 tracker | 6, 14, 17 |
  | §5.6 milestones | already in the frontend; history now comes from the API in 17 |
  | §5.7 scheduler + summary + Telegram | 12, 15 |
  | §5.8 search | 13, 17 |
  | §7 evals | 18 |
  | tests / CI | 1, 18 |
  | honesty checks | 4, 11 |
  | §8 stack | 1, 6, 13, 16 |
  | §9 events hook | 6 |
  | §10 constraints | Global Constraints |
  | §11 phases 4–7 | 1–19 |
  | §11a profile in DB | 6, 14 |
  | evidence language / display | 11 |
  | §11b student | 5 |
  | §11b Mac + catch-up | 15 |
  | §11b Tailscale | 16 |
  | §11b defense | 5, 11, 12 |
  | §11b region | 5 |
  | §11b discovered companies | 8 |

- **Blocked on Nour:**
  - The Telegram bot token and chat id (Task 15 runs without them; alerts no-op until set).
  - The 30 hand labels (Task 18, Step 5).
  - Approval of the 3D look (from the prototype phase).
  - The public flip (Task 19, Step 7).
