# Darb Scouter: design

Date: 2026-10-25
Owner: Nour Alden Mousa (b14ckPanther)
Status: approved by Nour, 2026-10-25

## 1. Intent

Darb Scouter is a personal job scout styled after the Dragon Ball scouter. Every morning it collects new junior and intern software roles in Israel. It gives each one a **power level**, an honest score of how well Nour matches it, and shows exactly which skills are missing. It also tracks every application from first send to offer.

It exists for two reasons:

1. **Nour uses it daily.** Nour is in the final semester of a B.Sc. in Information Systems Engineering (University of Haifa) and is applying for junior roles now.
2. **It proves new stacks in public.** Nour's GitHub is almost entirely TypeScript, Next.js and Supabase. This project is the first public proof of Python, FastAPI, agentic AI (LangGraph + LLM structured output), Elasticsearch, embeddings and vector search, scraping, and evals. FreeHire's Israeli listings rank these among the most requested skills that Nour's profile lacks: AI in 67% of 431 listings, Python in 41%, agentic AI in 25%.

It's the first project in a larger connected "universe" of portfolio projects (Realm, Code Dojo, Oracle and others). Later, Darb Scouter's events become "main quests" in Realm. That integration is **out of scope** here, but the design should not block it (see §9).

## 2. Goals

- A daily automated scan (07:00 Israel time) that collects new listings from the sources in §5.1, deduplicates them, and stores them.
- For every listing, extract structured requirements and compute a power level from 0 to about 10,000, with a per-requirement breakdown that traces to the job text and the CV.
- An interface that brings back Nour's childhood: DBZ's scouter at the core, DB's Dragon Radar for the morning reveal, and GT's Black Star Dragon Balls for milestones (§6).
- An application tracker with stages, notes and dates.
- A phone alert when a new listing scores over 9,000.
- A public repo that reads as professional work: tests, CI, an eval report, a README with a demo GIF, and an "AI workflow" section.

## 3. Non-goals

- Applying automatically or sending anything on Nour's behalf.
- Multi-user accounts, auth, or SaaS features. It is single-user, run by Nour. A simple shared-secret guard is enough if it's ever exposed.
- Scraping LinkedIn or any site whose terms forbid it. LinkedIn jobs arrive through paste-a-link only.
- Cloud hosting. That belongs to the later Cloud project. Local Docker Compose is enough for v1.
- Realm, Code Dojo or Oracle integration (only the hooks in §9).
- Mobile apps.

## 4. Anti-goals (would make it a failure even if it works)

- **A flattering score.** If the score inflates matches to feel good, the project fails. A job that requires 3+ years must visibly cost points even when everything else matches. Nour asked for honesty explicitly ("must be honest… not Wow-ing just because it's afraid to hurt my feelings").
- **A generic dashboard.** If it looks like a standard job board with a DBZ logo pasted on, it fails. The interface is the first thing people see and must feel nostalgic and crafted.
- **Infringing assets.** No official Dragon Ball art, character images, logos, music or sound clips. Every visual and sound is our own, inspired by the show. The repo will be public.
- **Fragile scraping that silently rots.** A broken collector must fail loudly (logged, counted, visible in the UI), never just return zero jobs.

## 5. Functional design

### 5.1 Job sources (collectors)

Each collector returns normalized `RawJob` records. Every collector runs independently, so one failing doesn't stop the others.

| Source | Method | Notes |
|---|---|---|
| FreeHire (freehire.me) | HTTP fetch of `/roles/{fullstack,backend,frontend}/israel?page=N` and parse the embedded job data. | Verified 2026-10-25: pages embed objects with `slug`, `enrichment.summary`, `seniority`, `requirements[{text,priority}]`, `skills[]`, `education_level`. Use these fields directly when present. Be polite: a delay between requests and a descriptive User-Agent. |
| Comeet | Public company careers API/pages for a configured list of companies. | Many Israeli companies use Comeet. Company list in config. |
| Greenhouse | Public boards API (`boards-api.greenhouse.io/v1/boards/{company}/jobs`). | Configured company list. |
| Lever | Public postings API (`api.lever.co/v0/postings/{company}`). | Configured company list. |
| Paste-a-link | Nour pastes any URL (LinkedIn, a careers page, anything). The page is fetched, or when fetching is blocked, Nour pastes the text. | The only route for LinkedIn. |

**Filtering:** keep Israel-located or Israel-remote roles. Keep `junior`, `intern`, `entry`, `graduate` and unlabeled roles. Labeled senior, lead, staff and principal roles are stored but hidden by default; a toggle shows them, since some "senior" labels are wrong.

**Deduplication:** by source URL. Across sources, by normalized (company, title) plus text similarity.

### 5.2 Requirement extraction (the agent)

A LangGraph pipeline turns each new job into a `JobProfile`:

- `must_have`: list of {skill, evidence_quote}
- `nice_to_have`: list of {skill, evidence_quote}
- `min_years_experience` (number or null) with evidence
- `seniority` (intern | junior | mid | senior+ | unknown)
- `education`: e.g. "B.Sc. CS or related", GPA requirement if stated
- `location`, `work_mode` (onsite/hybrid/remote)
- `language`: Hebrew posts are supported, and the output is always English

Rules:

- Use the Claude API with structured output validated by Pydantic. Default model: Claude Sonnet 5.5, with Haiku 5.5 allowed for cheap re-runs. The model ID lives in config.
- Every extracted item must carry an `evidence_quote` that appears verbatim in the job text. Items whose quote isn't found are dropped and logged. This is how the honesty rule (§4) is enforced at the source.
- When FreeHire already provides `requirements[{text,priority}]`, the agent normalizes those, not the free text.
- Skills normalize to a canonical vocabulary (e.g. "Node", "NodeJS", "Node.js" → `nodejs`) kept in a YAML file under version control.
- Extraction results are cached per job content hash. A job is never re-billed unless its text changes.

### 5.3 Nour's profile

A version-controlled `profile.yaml` (private values can be overridden by a git-ignored `profile.local.yaml`):

- Skills with levels: `proven` (a public repo shows it), `used` (real use, not public), `learning`. Each has optional evidence links.
- Education: degree, institution, expected graduation, GPA (optional; it goes in the local file only).
- Experience: years of professional practice as stated on the CV.
- Preferences: locations, work modes, roles to boost or exclude.

Seed it from Nour's CV at zangeel.dev/cv (Next.js, React, TypeScript, Supabase, PostgreSQL, RLS, Node.js, NestJS, Prisma, Redis, Docker, Playwright, Vitest, Flutter/Dart, etc.). Nour reviews the seed before first use.

### 5.4 Power level (scoring)

The score is deterministic code over the extracted `JobProfile` and the profile. The LLM extracts; it never scores. That keeps the score explainable and testable.

- Scale: 0 to 10,000+. Over 9,000 means a very strong, realistic match.
- Components, each with a visible line in the breakdown:
  - **Must-have skills:** the biggest weight. `proven` counts fully, `used` partially, `learning` a little, missing nothing.
  - **Nice-to-have skills:** a smaller weight.
  - **Seniority fit:** a junior/intern/unlabeled role is neutral, and a senior+ role takes a heavy penalty.
  - **Experience gap:** a penalty that grows with `min_years_experience` above Nour's years.
  - **Education fit:** meets or doesn't meet the degree and GPA requirements.
  - **Location / work mode** against preferences.
- Semantic match (embeddings) is used only to map job skill phrases to canonical skills when the vocabulary lookup misses. It never adds points by itself.
- **Training gains:** for each missing must-have or nice-to-have, compute "+N if you add this skill at `proven`". This drives the "Train X → +N" UI.
- Exact weights are the builder's call, then tuned against the eval set (§7).

### 5.5 Application tracker

Stages: `saved → applied → hr_call → tech_interview → home_task → final_interview → offer` plus `rejected` and `withdrawn`. Each application stores dates, contact, notes and the CV version sent. Moving stages is a single action in the UI.

### 5.6 Dragon Balls (milestones)

Seven Black Star Dragon Balls, earned once each across the whole search:

1. First application sent
2. 10 applications sent
3. First HR call
4. First technical interview
5. First home task submitted
6. First final interview
7. First offer

Collecting all seven triggers the "wish" moment. Milestones are derived from tracker data, not stored separately.

### 5.7 Daily run and alerts

- APScheduler job at 07:00 Asia/Jerusalem: collect → dedupe → extract → score → index.
- A run summary is stored: jobs found per source, failures, new matches, top score.
- A Telegram bot message goes out for any new job over 9,000, plus a one-line morning summary. The bot token lives in env vars.

### 5.8 Search

Elasticsearch indexes jobs for hybrid search: BM25 over title/company/text plus dense vectors from a multilingual sentence-transformers model, so Hebrew and English both work. Filters cover score range, stage, source, seniority, work mode and date.

## 6. Experience design

Inspired by Dragon Ball, Z and GT. Every asset is original (SVG/canvas/CSS drawn in-house, sounds synthesized with Web Audio). No official art, logos, characters or audio.

### 6.1 Screens

1. **Morning: Dragon Radar** (DB era). The opening view. A capsule-style radar sweeps, and last night's new jobs appear as blips placed by score (closer to the center means higher). It has a warm orange-sky palette and a short summary ("3 new jobs found overnight, best one 8,742"). Selecting a blip opens the scan.
2. **The scan: Scouter** (Z era). The core view. A green see-through lens with scanlines over a Namek-green world. The job card sits under a reticle that locks on, and the power level counts up with jitter, then settles. Below that:
   - ▲ matched skills
   - ▼ missing skills, each with its `+N` training gain
   - the experience and seniority lines, shown honestly when negative
   - each line opens its evidence quote from the post

   Over 9,000 cracks the lens, with a crack sound and a shake. "Train X" buttons show the simulated new score (and later link to Code Dojo).
3. **Journey: Black Star** (GT era). Application tracker and milestones on a dark violet starfield. The seven Dragon Balls orbit; collected ones glow amber and uncollected ones are grey stone. Applications show as routes across planets (stages). Applying fires a ki-blast animation.
4. **Scouter log.** Searchable, filterable list of all jobs with scores, as the fast, practical working view. It's styled as a scouter readout, but it's a dense list made for scanning.
5. **Settings / profile.** Edit skills and levels, sources and company lists, alert threshold.

### 6.2 Design first

The interface is built **before** the backend is wired, against realistic fixture data, and approved by Nour screen by screen. The bar Nour set is "jaw-dropping, breathtaking, next level". A screen that only looks nice isn't done.

### 6.3 Type system

To be chosen side by side in the visual companion. The candidates, all on Google Fonts (free license, public-repo safe):

- **Titles and logo:** Rampart One (the outlined, puffy 3D lettering of 90s anime title cards), Dela Gothic One (heavy, punchy), or Potta One (brush-ink energy).
- **Power level and scouter readout:** DotGothic16 (the dot-matrix pixel lettering of the scouter's own display) or Share Tech Mono.
- **Body:** Zen Kaku Gothic New or M PLUS Rounded 1c, both quiet and readable, with Japanese character.
- **Arabic and Hebrew strings,** if ever shown: matched fallbacks (e.g. Noto Sans Arabic / Hebrew).

### 6.4 Asset set (all original, generated in-house)

Every asset is drawn as SVG, canvas or shader code, or synthesized as audio, so the whole set is ours and the repo stays license-safe:

- **Devices:** the scouter (housing + lens + earpiece, with an animated readout), the Dragon Radar (casing, button, grid screen, sweep).
- **Collectibles:** 7 Dragon Balls (orange, 1–7 stars) and 7 Black Star Dragon Balls (stone-grey when uncollected), with gloss and inner-star rendering.
- **Worlds (backgrounds, layered for parallax):** an island on an orange-sky sea (radar morning), a Namek-style green sky with round trees (scouter), a violet GT starfield with planets (journey).
- **Energy:** ki aura (particle system around the power level), a ki-blast projectile with trail, the lens crack overlay, speed lines, a flash frame, and a capsule "pop" smoke puff for new jobs.
- **Characters:** none from the show. At most an original silhouette of a fighter in a powering-up pose, and an original dragon silhouette for the "wish" moment.
- **UI kit:** buttons styled like capsules, cards like scouter panels, stage chips, an empty state ("radar found nothing tonight"), loading (radar sweep), and an error state (cracked scouter).
- **Sound (Web Audio, synthesized):** scouter beep + count ticks, radar ping, lock-on chirp, over-9,000 crack, ki charge + blast, Dragon Ball collected chime, wish fanfare.
- **App icon / favicon / social preview image** for the README.

### 6.5 Feel

- Typography: per §6.3, picked by Nour in the companion.
- Motion: one orchestrated moment per screen (radar sweep, scouter lock-on, ki blast). Everything else is quiet. `prefers-reduced-motion` turns the animations into instant states.
- Sound: off by default. A toggle turns on the synthesized beeps, pings and crack.
- Accessibility: body text meets WCAG AA contrast; glows and effects sit on top of readable text, never in place of it. Keyboard navigable.
- Responsive: works at phone width, since Nour will check it on the phone.
- Reference: the era mockup Nour reviewed lives at `.superpowers/brainstorm/*/content/eras-v2.html` (local only).

## 7. Quality and honesty

- **Eval set:** about 30 real listings that Nour scores by hand (0–10 plus the must-haves Nour sees). Stored in `evals/`. A script reports extraction precision/recall on must-haves and the rank correlation between power level and Nour's scores. CI runs the cheap parts; full LLM evals run on demand.
- **Tests:** pytest unit tests for scoring, dedupe, normalization and each collector (against saved HTML/JSON fixtures, never live sites in CI). Frontend: Vitest for logic, plus one Playwright smoke test.
- **CI:** GitHub Actions running lint (ruff), type check (mypy or pyright), tests, and the frontend build.
- **Honesty checks:** no extracted item may lack a verbatim evidence quote (tested). A test ensures a "3+ years required" job can't score over 9,000 with Nour's current profile.

## 8. Architecture and stack

```
collectors ──► normalize/dedupe ──► Postgres (jobs, runs)
                                        │
                     LangGraph extractor (Claude) ──► JobProfile (Postgres, cached)
                                        │
                     scoring (pure Python) ──► scores + breakdown
                                        │
                     Elasticsearch index (BM25 + vectors)
                                        │
FastAPI ◄──────────────────────────────┘ ──► React app (radar / scouter / journey / log)
APScheduler (07:00) drives the pipeline · Telegram alerts
```

| Layer | Choice |
|---|---|
| Language/tooling | Python 3.13, uv, ruff, pytest |
| API | FastAPI + Pydantic v2 |
| Collectors | httpx; Playwright only where a page needs JS |
| Agent | LangGraph + Anthropic SDK (Claude), structured output |
| Embeddings | sentence-transformers, multilingual model |
| Search | Elasticsearch 8 (single node in Compose) |
| DB | PostgreSQL 16, SQLAlchemy 2 + Alembic |
| Scheduler | APScheduler |
| Alerts | Telegram Bot API |
| Frontend | React + Vite + TypeScript, GSAP, Canvas/PixiJS, Web Audio |
| Run/CI | Docker Compose, GitHub Actions |

Repo layout: a monorepo with `backend/` (Python package `scouter`), `frontend/`, `evals/`, `docs/`.

## 9. Future hooks (do not build now)

- Write a domain event (`job.applied`, `stage.changed`, `milestone.earned`) to an `events` table on every tracker change, so Realm and the Chronicle pipeline can consume them later.
- Keep "Train X" as a link target that can later point to Code Dojo.

## 10. Constraints

- Secrets (Anthropic key, Telegram token) only in env vars / a `.env` that git ignores.
- Commits are authored by Nour only. No AI co-author or attribution lines in commits or PRs.
- Repo stays private until phase 6 (public launch). Fixtures must not contain personal data beyond public job posts.
- Respect source sites: rate-limit, cache, and identify the client. No login-walled scraping.
- LLM cost: extraction cached by content hash; expected well under $5/month at roughly 50 new jobs a day.

## 11. Build phases

1. Design doc (this).
2. **Design system + asset set:** pick the fonts and palette in the companion, then build every asset in §6.4 as a browsable gallery page.
3. **Interactive prototype:** all five screens in React with fixture data (about 20 real FreeHire jobs, scored by hand), every animation and sound included. Nour approves each screen.
4. Collectors + data model + dedupe, with fixture tests.
5. Profile, extraction agent, scoring, eval set (needs about 30 minutes of Nour scoring jobs). The prototype switches to real data.
6. Daily scheduler, Telegram alerts, run summaries.
7. Public launch: README with demo GIF, AI-workflow section, Field Notes write-up, repo public.

## 11a. Calls made by Claude (Nour to check)

- **Profile storage:** `profile.yaml` is only the first seed. After import, the profile lives in Postgres and is edited in the Settings screen. Any profile change rescores all stored jobs (scoring is cheap, deterministic code). Scores store the profile version they were computed against.
- **Evidence text:** `evidence_quote` stays in the post's original language (Hebrew stays Hebrew), with a separate English `display` field. For FreeHire jobs, the stored job text is FreeHire's requirement lines plus the original post fetched from its apply URL when reachable. Quotes may match either, and the UI labels which one a quote came from.

## 11b. Decided by Nour (2026-10-25)

- **Student status:** Nour has 2–3 months of the degree left. Student-only roles that need 1.5+ years of studies remaining are hidden. "B.Sc. required" counts as **partly met** (Claude's recommendation, accepted) until graduation, when the profile flips it to met.
- **Where it runs:** Nour's Mac. The 07:00 scan catches up on wake if it was missed (APScheduler `misfire_grace_time` + a startup check of the last run). Telegram is the push channel. The phone opens the full app over Tailscale, with no public exposure.
- **Never show defense/military companies.** Nour won't be accepted there. Enforced two ways:
  - a maintained exclusion list (e.g. Elbit, Rafael, IAI, and other defense contractors)
  - an `is_defense` flag the extractor sets from the post (security clearance, "IDF/MOD projects", defense customers)

  Flagged jobs are dropped before scoring and counted in the run summary.
- **Region: north to center Israel.** Keep jobs located from the north (Haifa, Yokneam, Nazareth, Akko, Karmiel, Galilee, Caesarea, Hadera) through the center (Netanya, Herzliya, Ra'anana, Kfar Saba, Hod Hasharon, Petah Tikva, Rosh HaAyin, Tel Aviv, Ramat Gan, Givatayim, Bnei Brak, Holon, Rishon LeZion, Rehovot, Ness Ziona, Airport City, Modi'in). Also keep remote-in-Israel roles. Jerusalem and the south are hidden by default, with a toggle to show them.
- **Companies: all of them in that region, not a fixed list.** The company set is discovered rather than hand-picked. Every company seen on FreeHire, or added by paste-a-link, is checked for a public Comeet, Greenhouse or Lever board, which is then polled from then on. A seed list of known boards ships in config. For Comeet, the builder may read the public UID/token that companies embed in their own careers pages. That counts as public.

## 12. Left to the builder

- Exact scoring weights (tuned against evals), canonical skill vocabulary contents, embedding model choice, and the UI component structure.
- Animation library details (GSAP vs. hand-rolled for specific pieces) and the exact drawings, as long as they match §6 and stay original.
- Whether Playwright is needed for any specific source.
