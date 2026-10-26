# Darb Scouter

A personal job scout with a Dragon Ball scouter for a brain. Every morning it reads new junior software roles in northern and central Israel, gives each one a **match score out of 10,000** (the scouter's power level) for how well I actually fit it, and shows exactly which skills would push it past 9,000.

![The scouter locked onto a job](docs/media/scouter.png)

## What it does

- **Radar.** The morning screen. Last night's new jobs appear as blips on a phosphor radar; better matches sit closer to the centre.
- **Scouter.** Lock onto one job and the match score races up to its honest number. Every line of the score opens the sentence in the job post it came from. Training a missing skill shows what the score would become.
- **Journey.** Seven Black Star Dragon Balls, one for each first in the search: first application, first HR call, first technical interview, and on to the offer.
- **Log and settings.** Every job the radar has read, searchable, plus my own skill levels, which set every score.

The score is deliberately unflattering. A job that asks for three or more years loses points for it even when every skill matches, and every point traces back to a quoted requirement. If it can't quote the post, it doesn't score it.

| Radar | Journey |
| --- | --- |
| ![Radar](docs/media/radar.png) | ![Journey](docs/media/journey.png) |

## Status

This is the interactive prototype: the full interface running on 20 real listings pulled from [FreeHire](https://freehire.me), scored by a stand-in scorer. Next up is the Python backend: collectors for FreeHire, Comeet, Greenhouse and Lever, a LangGraph agent that extracts requirements with evidence, the real scoring engine, Elasticsearch search, and a 07:00 scan with Telegram alerts. The full design is in [`docs/superpowers/specs`](docs/superpowers/specs/2026-10-25-darb-scouter-design.md).

## Stack

- **Frontend:** React 19, TypeScript, Vite, React Router, GSAP
- **3D:** Three.js with custom GLSL shaders and post-processing (bloom, lens aberration, scanlines). The Dragon Balls are layered glass: a lit interior, extruded 3D stars, and a fresnel shell.
- **Sound:** synthesized in the browser with the Web Audio API. No samples.
- **Tests:** Vitest and Testing Library for logic and screens; Playwright for end-to-end flows, phone width, keyboard use, reduced motion and axe accessibility checks.

Every visual and sound is original and made in code. Inspired by Dragon Ball, Z and GT; no official art, logos, characters or audio.

## Run it

```bash
cd frontend
npm install
npm run dev
```

```bash
npx vitest run          # unit and screen tests
npx playwright test     # end-to-end
```

Sound is off by default. Turn it on with the speaker button in the bottom bar.

## Accessibility

Every blip, score line and control is keyboard reachable with a visible focus ring. With reduced motion on, every animation jumps to its final state. If WebGL is unavailable, each 3D scene falls back to a still image and the page still works.
