import gsap from 'gsap'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { play } from '../audio/sfx'
import { getLastScan, listJobs } from '../data/api'
import { formatPower, isOver9000, matchTier } from '../domain/power'
import { blipPosition } from '../domain/radar'
import type { Job } from '../domain/types'
import { useShaderCanvas, type Uniforms } from '../three/useShaderCanvas'
import { EmptyState } from '../ui/EmptyState'
import './radar.css'

// Phosphor radar: rings, grid, a sweeping beam with afterglow, slow noise in the glass.
// Blips are drawn by the DOM on top, so they stay real buttons.
const RADAR_FRAG = /* glsl */ `
uniform float uSweep;     // beam angle, radians
uniform float uIntro;     // 0..1 power-on
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 p = (vUv - .5) * 2.;
  p.x *= uRes.x / uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float disc = smoothstep(1.0, .985, r);
  // rings + crosshair + fine grid
  float rings = (1. - smoothstep(.0, .008, abs(fract(r * 4.) - .5) - .492)) * .55;
  float cross = (1. - smoothstep(.0, .004, min(abs(p.x), abs(p.y)))) * .45;
  vec2 g = abs(fract(p * 10.) - .5);
  float grid = (1. - smoothstep(.0, .015, min(g.x, g.y) - .0)) * .10;
  // beam: bright leading edge, long phosphor tail behind it
  float d = mod(uSweep - a, 6.28318);
  float tail = exp(-d * 2.6) * .75 + exp(-d * 40.) * 1.2;
  // glass noise + vignette inside the disc
  float n = hash(floor(vUv * uRes / 2.) + floor(uTime * 24.)) * .04;
  vec3 phosphor = vec3(.42, 1., .62);
  vec3 col = vec3(.01, .05, .03) + phosphor * (rings + cross + grid) * .55 + phosphor * tail * .5 + n;
  col *= .55 + .45 * smoothstep(1., .2, r);
  // bezel ring
  float bezel = smoothstep(.02, .0, abs(r - 1.012)) * .9;
  col += vec3(.75, .95, .8) * bezel * .35;
  float alpha = max(disc, bezel) * uIntro;
  gl_FragColor = vec4(col * uIntro, alpha);
}`

const scanLabel = (iso: string) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' }).replace(',', '')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' })
  return `${date} · ${time} scan`
}

export function RadarScreen() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [since, setSince] = useState<string | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [focus, setFocus] = useState<string | null>(null)
  const nav = useNavigate()
  const uniforms = useRef<Uniforms>({ uSweep: 0, uIntro: 0 })
  const canvasRef = useShaderCanvas(RADAR_FRAG, uniforms, () => setWebgl(false))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([listJobs(), getLastScan()]).then(([j, scan]) => {
      if (!alive) return
      setSince(scan.startedAt)
      setJobs(j)
    })
    return () => {
      alive = false
    }
  }, [])

  const fresh = useMemo(() => (jobs && since ? jobs.filter((j) => j.foundAt >= since) : []), [jobs, since])
  const best = fresh[0]
  const blips = useMemo(
    () => (jobs ?? []).map((j, i) => ({ job: j, pos: blipPosition(j.score.total, i), fresh: fresh.includes(j) })),
    [jobs, fresh],
  )

  // sweep + power-on choreography; pings fire as the beam crosses each fresh blip
  useLayoutEffect(() => {
    if (!jobs) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const u = uniforms.current
    if (reduce) {
      u.uIntro = 1
      u.uSweep = 1.2
      return
    }
    const ctx = gsap.context(() => {
      gsap.to(u, { uIntro: 1, duration: 1.2, ease: 'power2.out' })
      gsap.from('.rd-head > *', { y: 16, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', delay: 0.2 })
      gsap.from('.rd-blip', { scale: 0, opacity: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(3)', delay: 1.1 })
      gsap.from('.rd-find', { x: 24, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out', delay: 1.3 })
    }, rootRef)
    const pinged = new Set<string>()
    let last = performance.now()
    let raf = 0
    const spin = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const prev = u.uSweep as number
      u.uSweep = (prev + dt * 1.6) % (Math.PI * 2)
      for (const b of blips) {
        if (!b.fresh) continue
        // shader space is y-up; DOM is y-down
        const ang = (Math.atan2(-b.pos.y, b.pos.x) + Math.PI * 2) % (Math.PI * 2)
        const crossed = prev <= ang && (u.uSweep as number) > ang
        if (crossed && !pinged.has(b.job.id)) {
          pinged.add(b.job.id)
          play('ping')
          const el = rootRef.current?.querySelector(`[data-blip="${CSS.escape(b.job.id)}"]`)
          el?.classList.remove('is-hit')
          void (el as HTMLElement | null)?.offsetWidth
          el?.classList.add('is-hit')
        }
      }
      if ((u.uSweep as number) < prev) pinged.clear()
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    return () => {
      cancelAnimationFrame(raf)
      ctx.revert()
    }
  }, [jobs, blips])

  if (jobs && fresh.length === 0) {
    return (
      <div className="rd rd-empty">
        <EmptyState kind="radar-empty" />
      </div>
    )
  }

  const focused = blips.find((b) => b.job.id === focus)

  return (
    <div className={`rd${webgl ? '' : ' no-webgl'}`} ref={rootRef}>
      <div className="rd-sky" aria-hidden="true" />
      <header className="rd-head">
        <span className="rd-mark">Darb Scouter</span>
        <p className="rd-kicker">{since ? scanLabel(since) : ''}</p>
        <h1 className="rd-title">
          {fresh.length} new {fresh.length === 1 ? 'job' : 'jobs'} found overnight
        </h1>
        {best && (
          <p className="rd-lede">
            Best match: {best.title} at {best.company}, <b className={isOver9000(best.score.total) ? 'is-over' : ''}>{formatPower(best.score.total)}</b> out of 10,000.
          </p>
        )}
      </header>

      <div className="rd-stage">
        <div className="rd-tilt">
          <div className="rd-scope">
            <canvas ref={canvasRef} className="rd-canvas" aria-hidden="true" />
            <span className="rd-you" aria-hidden="true" />
            <ul className="rd-blips" aria-label="Jobs on the radar">
              {blips.map((b) => (
                <li
                  key={b.job.id}
                  className={`rd-blip${b.fresh ? ' is-fresh' : ''}${isOver9000(b.job.score.total) ? ' is-hot' : ''}`}
                  style={{ left: `${50 + b.pos.x * 46}%`, top: `${50 + b.pos.y * 46}%` }}
                  data-blip={b.job.id}
                >
                  <button
                    type="button"
                    aria-label={`${b.job.title} at ${b.job.company}, match ${formatPower(b.job.score.total)} out of 10,000${b.fresh ? ', new' : ''}`}
                    onClick={() => nav(`/job/${encodeURIComponent(b.job.id)}`)}
                    onMouseEnter={() => setFocus(b.job.id)}
                    onMouseLeave={() => setFocus(null)}
                    onFocus={() => setFocus(b.job.id)}
                    onBlur={() => setFocus(null)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
        {focused && (
          <div className="rd-tip" role="status">
            <span className="rd-tip-num">
              {formatPower(focused.job.score.total)} <small>/ 10,000 · {matchTier(focused.job.score.total)}</small>
            </span>
            <span className="rd-tip-t">{focused.job.title}</span>
            <span className="rd-tip-c">
              {focused.job.company} · {focused.job.city}
            </span>
          </div>
        )}
      </div>

      <aside className="rd-finds" aria-label="Found overnight">
        <h2 className="rd-finds-h">Found overnight</h2>
        <p className="rd-legend">Match out of 10,000. Closer to the centre of the radar means a better fit.</p>
        <ol>
          {fresh.map((j) => (
            <li key={j.id} className="rd-find">
              <Link to={`/job/${encodeURIComponent(j.id)}`}>
                <span className={`rd-find-num${isOver9000(j.score.total) ? ' is-over' : ''}`}>{formatPower(j.score.total)}</span>
                <span className="rd-find-t" dir="auto">
                  {j.title}
                </span>
                <span className="rd-find-c">
                  {j.company} · {j.city} · {j.workMode}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <Link className="rd-all" to="/log">
          All {jobs?.length ?? 0} tracked jobs
        </Link>
      </aside>
    </div>
  )
}
