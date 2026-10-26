import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../useCanvas'

type Pt = { x: number; y: number }

/**
 * A charged energy ball that flies from `from` to `to` (viewport px) with a
 * glowing trail and a burst on impact, then calls `onDone`.
 */
export function KiBlast({ from, to, onDone, color = '#7fd8ff' }: { from: Pt; to: Pt; onDone: () => void; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx || prefersReducedMotion()) {
      const id = setTimeout(() => done.current(), 0)
      return () => clearTimeout(id)
    }
    const dpr = Math.min(devicePixelRatio || 1, 2)
    c.width = innerWidth * dpr
    c.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const CHARGE = 0.45
    const FLY = 0.5
    const BURST = 0.45
    const trail: Pt[] = []
    const t0 = performance.now()
    let raf = 0
    const ease = (k: number) => k * k * (3 - 2 * k)
    const orb = (x: number, y: number, r: number, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
      g.addColorStop(0, `rgba(255,255,255,${a})`)
      g.addColorStop(0.25, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      ctx.globalCompositeOperation = 'lighter'
      if (t < CHARGE) {
        const k = t / CHARGE
        orb(from.x, from.y, 4 + 12 * k, 1)
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * 6
          const d = 60 * (1 - k)
          orb(from.x + Math.cos(a) * d, from.y + Math.sin(a) * d, 2, 0.8)
        }
      } else if (t < CHARGE + FLY) {
        const k = ease((t - CHARGE) / FLY)
        const x = from.x + (to.x - from.x) * k
        const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60
        trail.push({ x, y })
        if (trail.length > 22) trail.shift()
        trail.forEach((p, i) => orb(p.x, p.y, 3 + (i / trail.length) * 10, (i / trail.length) * 0.6))
        orb(x, y, 16, 1)
      } else if (t < CHARGE + FLY + BURST) {
        const k = (t - CHARGE - FLY) / BURST
        orb(to.x, to.y, 16 + 70 * k, 1 - k)
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(to.x, to.y, 20 + 120 * k, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.clearRect(0, 0, innerWidth, innerHeight)
        done.current()
        return
      }
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [from.x, from.y, to.x, to.y, color])

  return <canvas ref={ref} className="fx fx-blast" aria-hidden="true" />
}
