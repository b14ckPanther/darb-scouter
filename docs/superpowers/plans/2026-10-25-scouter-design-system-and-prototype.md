# Darb Scouter: Design System, Assets and Interactive Prototype. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phases 2–3 of the spec. Ship a complete, original DB/DBZ/GT-inspired design system and asset gallery, then a clickable five-screen prototype that runs on real FreeHire jobs as fixture data. Nour approves each screen before any backend work starts.

**Architecture:** A Vite + React + TypeScript app in `frontend/`. All assets are React components drawing SVG/canvas, plus synthesized Web Audio, with nothing raster or third-party. A fixture-backed data layer (`src/data/api.ts`) exposes the same functions the FastAPI backend will provide later, so the screens never change when real data arrives. Pure domain logic (milestones, training simulation, radar placement) lives in `src/domain/` and is unit-tested.

**Tech Stack:** Vite 6, React 19, TypeScript 5, react-router 7, GSAP 3, Vitest 3 + Testing Library, Playwright 1.48, Google Fonts.

**Spec:** `docs/superpowers/specs/2026-10-25-darb-scouter-design.md` (§6 Experience design, §5.5 tracker, §5.6 Dragon Balls, §11 phases 2–3)

## Global Constraints

- Every visual and sound is original: SVG/canvas/CSS drawn here, audio synthesized with Web Audio. No official Dragon Ball art, logos, characters, music or clips (spec §4, §6).
- No show characters. Only an original fighter silhouette and an original dragon silhouette (§6.4).
- Fonts come only from Google Fonts. The final choice comes from Task 1, picked by Nour among: Rampart One / Dela Gothic One / Potta One (titles), DotGothic16 / Share Tech Mono (readout), Zen Kaku Gothic New / M PLUS Rounded 1c (body) (§6.3).
- One orchestrated motion moment per screen (radar sweep, scouter lock-on, ki blast). `prefers-reduced-motion` turns them into instant end states (§6.5).
- Sound is **off by default**, with a toggle that persists (§6.5).
- Body text meets WCAG AA contrast. Glows sit over readable text, never in place of it. Every control is keyboard reachable with a visible focus ring (§6.5).
- Works at 390px phone width with no horizontal scroll (§6.5).
- Power level scale is 0–10,000+, and **over 9,000 means strictly > 9000** (§5.4).
- Application stages are exactly `saved, applied, hr_call, tech_interview, home_task, final_interview, offer, rejected, withdrawn` (§5.5).
- Milestones are exactly the seven in §5.6 and are derived from tracker data, not stored.
- Defense/military companies never appear in fixtures (§11b).
- Commits are authored by Nour's git identity only, with **no AI co-author or attribution lines** (§10).
- A screen counts as done only once Nour approves it in the browser. "Only looks nice" is not done (§6.2).

## Review Focus

1. **A job with no missing skills.** The scouter shows "Nothing to train. You match every listed skill.", never a blank gap list. Test in Task 7.
2. **Long or Hebrew job titles.** Titles wrap within the panel, use `dir="auto"`, and never overflow at 390px. Test in Task 7 (unit) and Task 10 (Playwright at 390px).
3. **No new jobs overnight.** The radar shows the "Radar found nothing tonight" empty state, not an empty grid. Test in Task 6.
4. **Out-of-range power levels.** Negative values display as 0. Values ≥ 10,000 display in full (e.g. 10,240) and still crack the lens. Test in Task 3.
5. **Audio before user interaction.** If the browser blocks `AudioContext` before the first user gesture, sfx calls are silent no-ops with no console error. Test in Task 4.

---

## File structure

```
frontend/
  index.html, vite.config.ts, tsconfig.json, package.json, playwright.config.ts
  scripts/fetch-freehire.mjs          # one-off: pulls real jobs into fixtures/raw
  src/
    main.tsx, App.tsx                 # router + shell (nav, sound toggle)
    theme/tokens.css                  # palette + type tokens (from Task 1)
    theme/global.css                  # reset, focus ring, reduced-motion
    domain/types.ts                   # Job, Score, Application, Stage, Milestone
    domain/power.ts                   # formatPower, isOver9000, simulateTraining
    domain/milestones.ts              # deriveMilestones
    domain/radar.ts                   # blipPosition
    data/fixtures/jobs.json           # ~20 real jobs + hand-made scores
    data/api.ts                       # fixture-backed API (same shape as backend)
    audio/sfx.ts                      # synthesized sounds + mute state
    motion/useCountUp.ts              # number race-up with jitter
    assets/devices/Scouter.tsx, DragonRadar.tsx
    assets/collectibles/DragonBall.tsx
    assets/worlds/IslandWorld.tsx, NamekWorld.tsx, StarfieldWorld.tsx
    assets/effects/KiAura.tsx, KiBlast.tsx, LensCrack.tsx, SpeedLines.tsx, FlashFrame.tsx, CapsulePuff.tsx
    assets/figures/FighterSilhouette.tsx, DragonSilhouette.tsx
    ui/CapsuleButton.tsx, ScouterPanel.tsx, StageChip.tsx, EmptyState.tsx, LoadingRadar.tsx, ErrorScouter.tsx
    screens/GalleryScreen.tsx, RadarScreen.tsx, ScouterScreen.tsx, JourneyScreen.tsx, LogScreen.tsx, SettingsScreen.tsx
  public/favicon.svg, social-preview.svg
  tests/e2e/smoke.spec.ts
```

---

### Task 1: Pick the type system and palette with Nour

**Files:**
- Create: `frontend/src/theme/tokens.css`
- Companion screen: `.superpowers/brainstorm/<session>/content/type-palette.html`

**Interfaces:**
- Produces: CSS custom properties used by every later task:
  - type: `--font-title`, `--font-readout`, `--font-body`
  - scale: `--step--1` … `--step-5`
  - DB palette: `--db-sky`, `--db-sea`, `--db-ink`, `--capsule`
  - Z palette: `--z-sky`, `--z-lens`, `--z-ink`
  - GT palette: `--gt-void`, `--gt-violet`, `--gt-red`, `--gt-amber`
  - shared: `--paper`, `--night`, `--focus`

- [ ] **Step 1:** Write a companion screen with three type pairings. Each one sets the same real content: "POWER LEVEL 8,742", "Junior Full Stack Developer · Artlist", and a 2-line body paragraph, drawn on each era's background. Also show two palette variants per era. Options carry `data-choice` for click capture.
- [ ] **Step 2:** Confirm the server is alive (`state/server-info` exists, no `server-stopped`), then give Nour the URL and wait for a pick in the terminal.
- [ ] **Step 3:** Write `tokens.css` with the chosen fonts (Google Fonts `<link>` goes in `index.html` in Task 2) and palette. Verify every text/background pair in the tokens reaches ≥ 4.5:1 with a contrast checker. Record the measured ratios as a comment in the file.
- [ ] **Step 4:** Commit: `git commit -m "Add Scouter type and color tokens"`

### Task 2: Scaffold the app, shell and CI

**Files:**
- Create: `frontend/` (Vite React-TS template), `src/main.tsx`, `src/App.tsx`, `src/theme/global.css`, `playwright.config.ts`, `.github/workflows/frontend.yml`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: routes `/` (Radar), `/job/:id` (Scouter), `/journey`, `/log`, `/settings`, `/gallery`, each rendering a placeholder heading until its task fills it.
- Produces: `<SoundToggle/>` in the shell, wired to `sfx.setMuted` from Task 4. Until then, a local state stub.

- [ ] **Step 1:** `npm create vite@6 frontend -- --template react-ts`, then add `react-router@7 gsap@3 vitest@3 @testing-library/react jsdom @playwright/test@1.48`.
- [ ] **Step 2:** Write the failing test `renders nav with all five screens`. It asserts links named Radar, Scouter log, Journey, Settings, and that `/gallery` renders the heading "Asset gallery".
- [ ] **Step 3:** Run `npx vitest run src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement `App.tsx` with the routes and nav, `global.css` (reset, `:focus-visible` ring using `--focus`, reduced-motion rule), and the Google Fonts link in `index.html`.
- [ ] **Step 5:** Run the test. Expected: PASS. Run `npm run build`. Expected: exits 0.
- [ ] **Step 6:** Add the CI workflow: install, `vitest run`, `build`, `playwright test` (chromium) on push and PR.
- [ ] **Step 7:** Commit: `git commit -m "Scaffold Scouter frontend shell and CI"`

### Task 3: Domain types and power helpers

**Files:**
- Create: `src/domain/types.ts`, `src/domain/power.ts`
- Test: `src/domain/power.test.ts`

**Interfaces:**
- Produces:

```ts
type Stage = 'saved'|'applied'|'hr_call'|'tech_interview'|'home_task'|'final_interview'|'offer'|'rejected'|'withdrawn';
type Evidence = { quote: string; display: string; source: 'post'|'freehire' };
type ScoreLine = { kind: 'must'|'nice'|'seniority'|'experience'|'education'|'location';
                   label: string; points: number; evidence?: Evidence; skill?: string; trainGain?: number };
type Score = { total: number; lines: ScoreLine[] };
type Job = { id: string; title: string; company: string; city: string; workMode: 'onsite'|'hybrid'|'remote';
             url: string; postedAt: string; foundAt: string; seniority: string; score: Score };
type Application = { id: string; jobId: string; stage: Stage; history: { stage: Stage; at: string }[]; notes: string };
type MilestoneId = 'first_application'|'ten_applications'|'first_hr_call'|'first_tech_interview'|'first_home_task'|'first_final_interview'|'first_offer';
type Milestone = { id: MilestoneId; star: 1|2|3|4|5|6|7; label: string; earnedAt: string|null };
```

  - `formatPower(n: number): string` returns the en-US grouped number, clamped at 0 below.
  - `isOver9000(n: number): boolean` is strictly `> 9000`.
  - `simulateTraining(score: Score, skill: string): number` returns `score.total` plus the `trainGain` of the line whose `skill` matches, or `score.total` unchanged.

- [ ] **Step 1:** Write the failing tests:
  - `formatPower(8742) === '8,742'`
  - `formatPower(-50) === '0'`
  - `formatPower(10240) === '10,240'`
  - `isOver9000(9000) === false`
  - `isOver9000(9001) === true`
  - `isOver9000(10240) === true`
  - `simulateTraining` with a line `{skill:'aws-sqs', trainGain:260}` on total 8742 returns `9002`
  - `simulateTraining` with an unknown skill returns `8742`
- [ ] **Step 2:** Run `npx vitest run src/domain/power.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `types.ts` and `power.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add Scouter domain types and power helpers"`

### Task 4: Synthesized sound kit

**Files:**
- Create: `src/audio/sfx.ts`
- Test: `src/audio/sfx.test.ts`

**Interfaces:**
- Produces:
  - `type SfxName = 'beep'|'tick'|'ping'|'lockOn'|'crack'|'kiCharge'|'kiBlast'|'chime'|'fanfare'`
  - `play(name: SfxName): void`
  - `setMuted(m: boolean): void`
  - `isMuted(): boolean`
  - Muted state persists in `localStorage['scouter.muted']`, defaults to `true`, and every storage access is wrapped in try/catch.

- [ ] **Step 1:** Write the failing tests:
  - `isMuted()` is `true` on a fresh store
  - after `setMuted(false)`, a new module instance reads `false`
  - `play('beep')` while muted never constructs an `AudioContext` (spy on the global)
  - `play('beep')` when the `AudioContext` constructor throws does not throw and does not call `console.error`
- [ ] **Step 2:** Run `npx vitest run src/audio/sfx.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement each sound with oscillators, noise buffers and gain envelopes, and create the `AudioContext` lazily on the first unmuted `play`:
  - `beep`: square wave, ~1.8 kHz, 60 ms
  - `tick`: 20 ms click
  - `ping`: sine 880 → 1320 Hz with a long tail
  - `lockOn`: two rising chirps
  - `crack`: filtered noise burst plus a falling saw
  - `kiCharge`: rising filtered noise, 1.2 s
  - `kiBlast`: noise whoosh plus a low thump
  - `chime`: three-note bell
  - `fanfare`: five-note major arpeggio
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "Add synthesized Scouter sound kit"`

### Task 5: Asset set and gallery (Nour approval gate)

**Files:**
- Create: every file under `src/assets/` and `src/ui/` listed in the file structure, plus `src/screens/GalleryScreen.tsx`, `public/favicon.svg`, `public/social-preview.svg`
- Test: `src/assets/assets.test.tsx`

**Interfaces:**
- Produces:
  - `<DragonBall variant: 'orange'|'blackstar'; stars: 1..7; lit: boolean; size?: number/>`
  - `<Scouter readout?: ReactNode; cracked?: boolean/>`
  - `<DragonRadar blips: {x:number;y:number;id:string}[]; sweeping: boolean; onBlip?(id)/>`
  - `<IslandWorld/>`, `<NamekWorld/>`, `<StarfieldWorld density?: number/>` (canvas, resizes with its container)
  - `<KiAura intensity: 0..1/>` (canvas particles)
  - `<KiBlast from:{x,y} to:{x,y} onDone()/>`
  - `<LensCrack visible: boolean/>`
  - `<SpeedLines/>`
  - `<CapsulePuff/>`
  - `<FighterSilhouette powered: boolean/>`
  - `<DragonSilhouette/>`
  - UI kit:
    - `<CapsuleButton>` (a real `<button>`)
    - `<ScouterPanel title>`
    - `<StageChip stage: Stage/>`
    - `<EmptyState kind:'radar-empty'|'no-gaps'|'no-applications'/>`
    - `<LoadingRadar/>`
    - `<ErrorScouter message: string/>`

- [ ] **Step 1:** Write the failing tests:
  - `DragonBall` renders exactly `stars` star polygons for 1–7
  - `blackstar` + `lit=false` uses the stone fill token
  - `CapsuleButton` is a `button` element
  - `EmptyState kind="radar-empty"` contains the text "Radar found nothing tonight"
  - `EmptyState kind="no-gaps"` contains "Nothing to train. You match every listed skill."
- [ ] **Step 2:** Run `npx vitest run src/assets`. Expected: FAIL.
- [ ] **Step 3:** Draw each asset per spec §6.4 as SVG/canvas, using only token colors. Keep canvas effects behind `requestAnimationFrame`, stop them when off-screen (IntersectionObserver), and render a static frame under reduced motion.
- [ ] **Step 4:** Build `GalleryScreen` with every asset on its era background:
  - all 14 Dragon Balls in a row
  - each effect behind a "Play" button that also plays its sound
  - the UI kit in every state
- [ ] **Step 5:** Run the tests. Expected: PASS. Then screenshot `/gallery` at 1440px and 390px with Playwright and review the screenshots yourself. Fix anything clipped, off-palette or unreadable.
- [ ] **Step 6:** Show Nour `/gallery` (`npm run dev`) and stop until Nour approves. Record the requested changes, then apply them and re-show.
- [ ] **Step 7:** Commit: `git commit -m "Add original Scouter asset set and gallery"`

### Task 6: Fixture jobs, data layer and the Radar screen (Nour approval gate)

**Files:**
- Create: `scripts/fetch-freehire.mjs`, `src/data/fixtures/jobs.json`, `src/data/api.ts`, `src/domain/radar.ts`, `src/domain/milestones.ts`, `src/screens/RadarScreen.tsx`
- Test: `src/domain/radar.test.ts`, `src/domain/milestones.test.ts`, `src/data/api.test.ts`, `src/screens/RadarScreen.test.tsx`

**Interfaces:**
- Consumes: types and power helpers (Task 3), `DragonRadar`, `IslandWorld`, `EmptyState` (Task 5), `play` (Task 4).
- Produces:
  - `listJobs(f?: {sinceFoundAt?: string; minScore?: number}): Promise<Job[]>`
  - `getJob(id: string): Promise<Job|undefined>`
  - `listApplications(): Promise<Application[]>`
  - `applyToJob(jobId: string): Promise<Application>`
  - `moveStage(appId: string, stage: Stage): Promise<Application>`
  - The data layer keeps state in memory and mirrors it to localStorage (try/catch). `__setFixtureJobs(jobs: Job[])` exists for tests only.
  - `blipPosition(score: number, index: number): {x:number;y:number}` returns coordinates in [-1,1]. The radius is `1 - clamp(score,0,10000)/10000*0.85`, and the angle is a golden-angle spread by index.
  - `deriveMilestones(apps: Application[]): Milestone[]` always returns the 7 spec milestones in order, with `earnedAt` set to the first qualifying history timestamp.

- [ ] **Step 1:** Write `fetch-freehire.mjs`. It fetches `https://freehire.me/roles/{fullstack,backend,frontend}/israel?page=1..3`, extracts the embedded job objects, and writes `fixtures/raw.json`. Then hand-pick 20 jobs: junior/intern/unlabeled first, north–center cities, no defense companies (§11b), at least 2 Hebrew posts, and 1 job with no gaps. Write `jobs.json` by hand, drafting `score.lines` with real evidence quotes copied from each post. **Scores are honest by spec §4.** A "3+ years" job loses ≥ 1,500 points in an `experience` line and must not exceed 9,000.
- [ ] **Step 2:** Write the failing tests:
  - `blipPosition(10000,0)` has radius ≈ 0.15
  - `blipPosition(0,3)` has radius ≈ 1
  - `deriveMilestones([])` has 7 entries, all `earnedAt === null`
  - 10 applications in `applied` earn stars 1–2 only
  - an app that went `applied → hr_call → tech_interview` earns 1, 3 and 4, with the hr_call timestamp on 3
  - `applyToJob` then `listApplications` includes the job in stage `applied`
  - every job in `jobs.json` with an `experience` line of points ≤ −1500 has `total ≤ 9000`
  - every `must`/`nice` line has a non-empty `evidence.quote`
  - `RadarScreen` with zero jobs since the last visit shows "Radar found nothing tonight"
- [ ] **Step 3:** Run `npx vitest run src/domain src/data src/screens/RadarScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement `api.ts`, `radar.ts`, `milestones.ts` and `RadarScreen`. The screen is the DB morning:
  - the island world and a large Dragon Radar that sweeps once on load (GSAP), with a `ping` per blip as the sweep passes it
  - a summary line, e.g. "3 new jobs found overnight. Best one 8,742."
  - selecting a blip (click or keyboard) navigates to `/job/:id`
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Screenshot at 1440px and 390px, self-review, fix, then show Nour. Stop until Nour approves.
- [ ] **Step 7:** Commit: `git commit -m "Add fixture data layer and Dragon Radar morning screen"`

### Task 7: The Scouter screen (Nour approval gate)

**Files:**
- Create: `src/motion/useCountUp.ts`, `src/screens/ScouterScreen.tsx`
- Test: `src/motion/useCountUp.test.ts`, `src/screens/ScouterScreen.test.tsx`

**Interfaces:**
- Consumes: `getJob`, `applyToJob` (Task 6); `formatPower`, `isOver9000`, `simulateTraining` (Task 3); `Scouter`, `NamekWorld`, `LensCrack`, `KiAura`, `KiBlast`, `EmptyState` (Task 5); `play` (Task 4).
- Produces: `useCountUp(target: number, opts?: {durationMs?: number; jitter?: number; from?: number}): number`. Under reduced motion it returns `target` on the first render.

- [ ] **Step 1:** Write the failing tests:
  - `useCountUp(8742)` under a mocked reduced-motion `matchMedia` returns `8742` immediately
  - `ScouterScreen` for the fixture job with no gaps shows "Nothing to train. You match every listed skill."
  - clicking "Train AWS SQS" on a job at 8,742 with gain 260 shows `9,002` and sets `data-over9000="true"` on the scouter root
  - a Hebrew-titled job renders its title element with `dir="auto"`
  - each score line is a button that reveals its evidence quote and labels it "from the post" or "from FreeHire"
- [ ] **Step 2:** Run `npx vitest run src/motion src/screens/ScouterScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the screen per spec §6.1 (2):
  - the Namek world with the lens overlay and scanlines
  - the reticle locks on with a `lockOn` sound
  - the power level counts up with jitter and a `tick` sound
  - ▲ matched / ▼ gap lines, each with `+N`; experience and seniority lines show their negative points honestly
  - "Train X" buttons re-run the count from the current value to the simulated value
  - over 9,000 triggers the `LensCrack`, a 450 ms shake, the `crack` sound and "IT'S OVER 9,000!"
  - an "Apply" `CapsuleButton` fires `KiBlast` + `kiBlast`, then calls `applyToJob`
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Screenshot at 1440px and 390px, self-review, fix, then show Nour. Stop until Nour approves.
- [ ] **Step 6:** Commit: `git commit -m "Add Scouter scan screen"`

### Task 8: The Journey screen (Nour approval gate)

**Files:**
- Create: `src/screens/JourneyScreen.tsx`
- Test: `src/screens/JourneyScreen.test.tsx`

**Interfaces:**
- Consumes: `listApplications`, `moveStage` (Task 6); `deriveMilestones` (Task 6); `StarfieldWorld`, `DragonBall`, `DragonSilhouette`, `StageChip`, `EmptyState` (Task 5); `play` (Task 4).

- [ ] **Step 1:** Write the failing tests:
  - with no applications it shows `EmptyState kind="no-applications"` and seven unlit Black Star balls
  - moving an app to `hr_call` lights the 3-star ball and calls `play('chime')`
  - when all 7 milestones are earned, the wish overlay with `DragonSilhouette` renders and calls `play('fanfare')`
- [ ] **Step 2:** Run `npx vitest run src/screens/JourneyScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6.1 (3):
  - a GT starfield with the seven balls orbiting (lit ones are amber, the rest stone)
  - each application drawn as a route across planets, one per stage
  - stage moves through an accessible `<select>` or buttons on each route
  - `rejected` and `withdrawn` routes fade but stay listed
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Screenshot at 1440px and 390px, self-review, fix, then show Nour. Stop until Nour approves.
- [ ] **Step 6:** Commit: `git commit -m "Add Black Star journey screen"`

### Task 9: Scouter log and Settings screens (Nour approval gate)

**Files:**
- Create: `src/screens/LogScreen.tsx`, `src/screens/SettingsScreen.tsx`
- Test: `src/screens/LogScreen.test.tsx`, `src/screens/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `listJobs`, `listApplications` (Task 6); `formatPower` (Task 3); `ScouterPanel`, `StageChip` (Task 5); `setMuted`, `isMuted` (Task 4).

- [ ] **Step 1:** Write the failing tests:
  - Log filters: typing "Haifa" leaves only Haifa jobs; `minScore=9000` shows only jobs over 9,000; it sorts by score descending by default
  - Settings: the sound toggle reflects `isMuted()` and calls `setMuted(false)` when turned on; the alert threshold input defaults to `9000`; a "Show Jerusalem and south" toggle is present and off by default
- [ ] **Step 2:** Run `npx vitest run src/screens/LogScreen.test.tsx src/screens/SettingsScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement both screens:
  - **Log:** a dense list styled as a scouter readout (readout font for numbers, `tabular-nums`) with search, score, stage, work mode and city filters. A row opens `/job/:id`.
  - **Settings:** profile skills with levels (`proven/used/learning`, prototype-only and kept in localStorage), sound, alert threshold, region toggle.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Screenshot at 1440px and 390px, self-review, fix, then show Nour. Stop until Nour approves.
- [ ] **Step 6:** Commit: `git commit -m "Add Scouter log and settings screens"`

### Task 10: End-to-end smoke, accessibility pass, README preview

**Files:**
- Create: `frontend/tests/e2e/smoke.spec.ts`
- Modify: `README.md` (project intro, screenshot from Task 7, "run locally" section)

- [ ] **Step 1:** Write the Playwright smoke tests:
  - load `/`, click the first blip, expect a URL matching `/job/`, then expect the power level text to settle to the fixture total within 4 s
  - with `reducedMotion: 'reduce'`, the power level shows its final value on first paint
  - at viewport 390×844, `/`, `/job/<hebrew-job-id>`, `/journey` and `/log` have `document.documentElement.scrollWidth <= 390`
  - Tab from page load reaches the first blip and Enter opens it
- [ ] **Step 2:** Run `npx playwright test`. Fix any failures, and re-run until all pass.
- [ ] **Step 3:** Run an axe check (`@axe-core/playwright`) on all five screens. Expected: zero serious or critical violations.
- [ ] **Step 4:** Update the README with what Darb Scouter is, a screenshot of the scouter scan, and `npm install && npm run dev`. No AI attribution lines.
- [ ] **Step 5:** Commit: `git commit -m "Add Scouter e2e smoke tests and README preview"`
