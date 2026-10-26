import gsap from 'gsap'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { play } from '../audio/sfx'
import { EnergyDragon } from '../assets/effects/EnergyDragon'
import { listApplications, listJobs, moveStage } from '../data/api'
import { deriveMilestones } from '../domain/milestones'
import type { Application, Job, Stage } from '../domain/types'
import { createJourneyScene, type JourneyControls } from '../three/journeyScene'
import { EmptyState } from '../ui/EmptyState'
import { STAGE_LABEL } from '../ui/StageChip'
import './journey.css'

const ROUTE: Stage[] = ['applied', 'hr_call', 'tech_interview', 'home_task', 'final_interview', 'offer']
const ALL: Stage[] = [...ROUTE, 'rejected', 'withdrawn']
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function JourneyScreen() {
  const [apps, setApps] = useState<Application[] | null>(null)
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map())
  const [webgl, setWebgl] = useState(true)
  const [wishSeen, setWishSeen] = useState(false)
  // stage picks are drafts until saved, so arrowing through the list never writes history
  const [draft, setDraft] = useState<Record<string, Stage>>({})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<JourneyControls | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const prevEarned = useRef<boolean[] | null>(null)

  useEffect(() => {
    void Promise.all([listApplications(), listJobs()]).then(([a, j]) => {
      setApps(a)
      setJobs(new Map(j.map((x) => [x.id, x])))
    })
  }, [])

  const milestones = useMemo(() => deriveMilestones(apps ?? []), [apps])
  const earned = milestones.map((m) => !!m.earnedAt)
  const count = earned.filter(Boolean).length
  const wish = count === 7

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    try {
      sceneRef.current = createJourneyScene(c, () => setWebgl(false))
    } catch {
      setWebgl(false)
    }
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  // light balls; chime + celebrate only for ones earned during this visit
  useEffect(() => {
    if (!apps) return
    sceneRef.current?.setEarned(earned)
    const prev = prevEarned.current
    if (prev) {
      earned.forEach((e, i) => {
        if (e && !prev[i]) {
          sceneRef.current?.celebrate(i)
          play('chime')
        }
      })
    }
    prevEarned.current = earned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, earned.join()])

  useEffect(() => {
    if (wish && !wishSeen) play('fanfare')
  }, [wish, wishSeen])

  useLayoutEffect(() => {
    if (!apps || !rootRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.from('.jr-head > *', { y: 18, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' })
      gsap.from('.jr-ms li', { x: -12, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out', delay: 0.3 })
      gsap.from('.jr-route', { y: 16, opacity: 0, duration: 0.55, stagger: 0.07, ease: 'power3.out', delay: 0.5 })
    }, rootRef)
    return () => ctx.revert()
  }, [apps])

  const save = async (a: Application) => {
    const stage = draft[a.id]
    if (!stage || stage === a.stage) return
    const next = await moveStage(a.id, stage)
    setDraft((d) => {
      const rest = { ...d }
      delete rest[a.id]
      return rest
    })
    setApps((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))
  }

  const active = (apps ?? []).filter((a) => a.stage !== 'rejected' && a.stage !== 'withdrawn')
  const closed = (apps ?? []).filter((a) => a.stage === 'rejected' || a.stage === 'withdrawn')

  return (
    <div className={`jr${webgl ? '' : ' no-webgl'}`} ref={rootRef}>
      <canvas ref={canvasRef} className="jr-canvas" aria-hidden="true" />
      <div className="jr-shade" aria-hidden="true" />

      <header className="jr-head">
        <p className="jr-kicker">The journey</p>
        <h1 className="jr-title">
          {count} of 7 Black Star Dragon Balls
        </h1>
        <p className="jr-lede">Each one marks a first in your search. Collect all seven and the offer is yours.</p>
      </header>

      <ol className="jr-ms" aria-label="Milestones">
        {milestones.map((m) => (
          <li key={m.id} data-star={m.star} data-earned={!!m.earnedAt}>
            <span className="jr-ms-orb" aria-hidden="true">
              {'★'.repeat(m.star)}
            </span>
            <span className="jr-ms-label">{m.label}</span>
            <span className="jr-ms-when">{m.earnedAt ? day(m.earnedAt) : 'Not yet'}</span>
          </li>
        ))}
      </ol>

      <section className="jr-routes" aria-label="Applications">
        {apps && apps.length === 0 && (
          <div className="jr-empty">
            <EmptyState kind="no-applications" />
            <Link className="jr-cta" to="/">
              Open the radar
            </Link>
          </div>
        )}
        {[...active, ...closed].map((a) => {
          const job = jobs.get(a.jobId)
          const name = job ? `${job.title} at ${job.company}` : a.jobId
          const at = ROUTE.indexOf(a.stage)
          return (
            <article key={a.id} className={`jr-route${at < 0 ? ' is-closed' : ''}`}>
              <div className="jr-route-top">
                <Link to={`/job/${encodeURIComponent(a.jobId)}`} className="jr-route-name" dir="auto">
                  {job?.title ?? a.jobId}
                </Link>
                <span className="jr-route-co">{job?.company}</span>
                <div className="jr-stage">
                  <select aria-label={`Stage for ${name}`} value={draft[a.id] ?? a.stage} onChange={(e) => setDraft((d) => ({ ...d, [a.id]: e.target.value as Stage }))}>
                    {ALL.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {draft[a.id] && draft[a.id] !== a.stage && (
                    <button type="button" className="hs-btn jr-save" aria-label={`Save stage for ${name}`} onClick={() => void save(a)}>
                      Save
                    </button>
                  )}
                </div>
              </div>
              <ol className="jr-planets" aria-hidden="true">
                {ROUTE.map((s, i) => (
                  <li key={s} className={i < at ? 'is-past' : i === at ? 'is-here' : ''}>
                    <span>{STAGE_LABEL[s]}</span>
                  </li>
                ))}
              </ol>
            </article>
          )
        })}
      </section>

      {wish && !wishSeen && (
        <div
          className="jr-wish"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wish-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setWishSeen(true)
            // one control inside: keep Tab from leaving the dialog
            if (e.key === 'Tab') e.preventDefault()
          }}
        >
          <EnergyDragon />
          <div className="jr-wish-copy">
            <h2 id="wish-title">Your wish is granted</h2>
            <p>All seven collected, from a first application to an offer. Go and say yes.</p>
            <button type="button" className="hs-btn" onClick={() => setWishSeen(true)} autoFocus>
              Back to the journey
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
