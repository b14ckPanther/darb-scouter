import gsap from 'gsap'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { play } from '../audio/sfx'
import { KiBlast } from '../assets/effects/KiBlast'
import { applyToJob, getJob, listApplications } from '../data/api'
import { formatPower, isOver9000, matchTier } from '../domain/power'
import type { Job, ScoreLine } from '../domain/types'
import { useCountUp } from '../motion/useCountUp'
import { createHeroScene, type HeroControls } from '../three/heroScene'
import { EmptyState } from '../ui/EmptyState'
import { ErrorScouter } from '../ui/ErrorScouter'
import './scouter-hud.css'
import './scouter.css'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const sign = (n: number) => (n > 0 ? `+${formatPower(n)}` : n < 0 ? `−${formatPower(-n)}` : '0')
const starsFor = (total: number) => Math.max(1, Math.min(7, Math.ceil(total / 1430))) as 1 | 2 | 3 | 4 | 5 | 6 | 7

function Line({ line, open, onToggle }: { line: ScoreLine; open: boolean; onToggle: () => void }) {
  const gap = (line.trainGain ?? 0) > 0
  return (
    <li className={`sc-line kind-${line.kind}${gap ? ' is-gap' : ''}${line.points < 0 ? ' is-neg' : ''}${line.points === 0 && !line.skill && !gap ? ' is-unscored' : ''}`}>
      <button type="button" aria-expanded={open} onClick={onToggle} disabled={!line.evidence}>
        <span className="sc-line-mark" aria-hidden="true">
          {gap ? '▼' : line.points < 0 ? '−' : line.points === 0 && !line.skill ? '·' : '▲'}
        </span>
        <span className="sc-line-label">{line.label}</span>
        <span className="sc-line-pts">{gap ? sign(line.trainGain ?? 0) : sign(line.points)}</span>
      </button>
      {open && line.evidence && (
        <blockquote className="sc-evidence">
          <p dir="auto">{line.evidence.quote}</p>
          <cite>{line.evidence.source === 'post' ? 'from the post' : 'from FreeHire'}</cite>
        </blockquote>
      )}
    </li>
  )
}

export function ScouterScreen() {
  const { id = '' } = useParams()
  const [job, setJob] = useState<Job | null | undefined>(undefined)
  const [applied, setApplied] = useState(false)
  const [trained, setTrained] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [blast, setBlast] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<HeroControls | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setJob(undefined)
    setTrained([])
    setCracked(false)
    setOpen(null)
    setWebgl(true)
    void Promise.all([getJob(decodeURIComponent(id)), listApplications()]).then(([j, apps]) => {
      if (!alive) return
      setJob(j ?? null)
      setApplied(!!j && apps.some((a) => a.jobId === j.id))
    })
    return () => {
      alive = false
    }
  }, [id])

  const base = job?.score.total ?? 0
  const gain = (job?.score.lines ?? []).filter((l) => l.skill && trained.includes(l.skill)).reduce((a, l) => a + (l.trainGain ?? 0), 0)
  const power = base + gain
  const [cracked, setCracked] = useState(false)
  const shown = useCountUp(power, { from: 0, durationMs: trained.length ? 1100 : 2200, onTick: () => play('tick') })

  // 3D scene, created once a job is known (its stars depend on the score)
  useEffect(() => {
    const c = canvasRef.current
    if (!job || !c) return
    try {
      sceneRef.current = createHeroScene(c, starsFor(job.score.total), () => setWebgl(false))
    } catch {
      setWebgl(false)
      return
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') sceneRef.current?.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    }
    const reset = () => sceneRef.current?.setPointer(0, 0)
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('blur', reset)
    return () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('blur', reset)
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [job])

  useEffect(() => {
    sceneRef.current?.setCharge(0.2 + 0.7 * Math.min(1, shown / 10000))
  }, [shown])

  // the lens cracks once per job, the moment the reading lands above 9,000
  useEffect(() => {
    if (!job || cracked || shown !== power || !isOver9000(power)) return
    setCracked(true)
    play('crack')
    sceneRef.current?.impact()
  }, [job, cracked, shown, power])

  // intro: lens slides on, reticle locks, telemetry types in
  useLayoutEffect(() => {
    if (!job || !rootRef.current) return
    if (reduced()) {
      sceneRef.current?.setLens(1)
      return
    }
    const ctx = gsap.context(() => {
      const lens = { v: 0 }
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hs-veil', { opacity: 1, duration: 0.9, ease: 'power2.inOut' })
        .to(lens, { v: 1, duration: 0.8, onUpdate: () => sceneRef.current?.setLens(lens.v) }, 0.5)
        .from('.hs-bracket', { scale: 2.4, opacity: 0, duration: 0.7, stagger: 0.05, ease: 'expo.out' }, 0.7)
        .add(() => play('lockOn'), 0.8)
        .from('.hs-ring', { rotate: -120, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0.7)
        .from('.sc-tel > *', { x: -18, opacity: 0, duration: 0.5, stagger: 0.06 }, 0.9)
        .from('.sc-lines > li', { y: 8, opacity: 0, duration: 0.4, stagger: 0.04 }, 1.8)
        .from('.sc-actions', { y: 12, opacity: 0, duration: 0.5 }, 2.2)
    }, rootRef)
    return () => ctx.revert()
  }, [job])

  if (job === undefined) return <div className="hs" aria-busy="true" />
  if (job === null)
    return (
      <div className="sc-missing">
        <ErrorScouter message="This job isn't in your scan any more. It may have closed." />
      </div>
    )

  const skillLines = job.score.lines.filter((l) => l.kind === 'must' || l.kind === 'nice')
  const matched = skillLines.filter((l) => !(l.trainGain ?? 0))
  const gaps = skillLines.filter((l) => (l.trainGain ?? 0) > 0)
  const readings = job.score.lines.filter((l) => l.kind !== 'must' && l.kind !== 'nice')
  const key = (l: ScoreLine) => `${l.kind}:${l.label}`

  const train = (l: ScoreLine) => {
    if (!l.skill || trained.includes(l.skill)) return
    play('kiCharge')
    sceneRef.current?.setCharge(0.95)
    setTrained((t) => [...t, l.skill!])
  }

  const apply = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    play('kiCharge')
    setTimeout(() => play('kiBlast'), 450)
    setBlast({ from: { x: r.left + r.width / 2, y: r.top }, to: { x: innerWidth / 2, y: innerHeight * 0.42 } })
  }
  const landed = () => {
    setBlast(null)
    sceneRef.current?.impact()
    void applyToJob(job.id).then(() => setApplied(true))
  }

  return (
    <div className={`hs sc${cracked ? ' is-over' : ''}${webgl ? '' : ' no-webgl'}`} ref={rootRef} data-over9000={cracked}>
      <canvas ref={canvasRef} className="hs-canvas" aria-hidden="true" />
      <div className="hs-veil" aria-hidden="true" />
      <div className="hs-lensframe" aria-hidden="true">
        <span className="hs-lens-edge" />
        <span className="hs-lens-glint" />
      </div>
      <div className="hs-reticle" aria-hidden="true">
        <svg className="hs-ring" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 5.2" />
          <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
          <path d="M100 2v10M100 188v10M2 100h10M188 100h10" stroke="currentColor" strokeWidth="1.2" />
          <path d="M30 30a99 99 0 0 1 40-22" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M170 170a99 99 0 0 1-40 22" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="hs-bracket tl" />
        <span className="hs-bracket tr" />
        <span className="hs-bracket bl" />
        <span className="hs-bracket br" />
      </div>

      <section className="sc-tel" aria-label="Target">
        <span className="hs-k">Target locked</span>
        <h1 className="hs-title" dir="auto">
          {job.title}
        </h1>
        <p className="hs-sub">
          {job.company} · {job.city} · {job.workMode}
        </p>
        <a className="sc-post" href={job.url} target="_blank" rel="noreferrer">
          Open the post
        </a>
      </section>

      <section className="sc-read" aria-label="Match">
        <span className="hs-readout-label">Match</span>
        <span className="sc-reading" aria-hidden="true">
          <span className="hs-num">{formatPower(shown)}</span>
          <span className="sc-of">/ 10,000</span>
        </span>
        <span className={`sc-tier tier-${matchTier(power).split(' ')[0].toLowerCase()}`} aria-hidden="true">
          {matchTier(power)}
        </span>
        <p className="sc-explain">How well your skills fit this job. Over 9,000 is a top match.</p>
        <span className="sr-only" role="status">
          {shown === power ? `Match ${formatPower(power)} out of 10,000: ${matchTier(power)}` : ''}
        </span>
        <p className="hs-over" aria-hidden={!cracked}>
          It's over 9,000!
        </p>

        <div className="sc-scroll">
          {gaps.length === 0 && <EmptyState kind="no-gaps" />}
          <ul className="sc-lines" aria-label="Score breakdown">
            {[...gaps, ...matched, ...readings].map((l) => (
              <Line key={key(l)} line={l} open={open === key(l)} onToggle={() => setOpen(open === key(l) ? null : key(l))} />
            ))}
          </ul>
        </div>

        <div className="sc-actions">
          {gaps.map((g) => (
            <button key={`${g.kind}:${g.label}`} type="button" className="hs-btn ghost" disabled={trained.includes(g.skill ?? '')} onClick={() => train(g)}>
              Train {g.trainLabel ?? g.label}
            </button>
          ))}
          <button type="button" className="hs-btn sc-apply" disabled={applied || !!blast} onClick={apply}>
            {applied ? 'Applied' : 'Apply'}
          </button>
        </div>
      </section>

      <svg className="hs-crack" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {['M74 6 70 12 72 17 64 24', 'M64 24 66 31 58 37 61 44 53 50', 'M53 50 55 58 49 64', 'M70 12 79 15 85 23 93 25', 'M72 17 80 26 84 37', 'M64 24 55 21 48 26 40 24', 'M58 37 48 40 44 47', 'M61 44 70 49 73 58 80 63', 'M66 31 73 33', 'M55 21 53 14 47 10', 'M48 40 43 36', 'M53 50 46 52 41 59 36 61', 'M49 64 52 72 50 78'].map((d) => (
          <path key={d} pathLength={1} d={d} />
        ))}
      </svg>
      {blast && <KiBlast from={blast.from} to={blast.to} onDone={landed} color="#ffb547" />}
    </div>
  )
}
