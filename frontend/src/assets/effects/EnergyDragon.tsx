import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../useCanvas'

/**
 * The wish: a dragon made only of light. A long serpentine ribbon of additive energy
 * uncoils upward with sparks shedding off it. No drawn illustration, just motion and glow.
 */
export function EnergyDragon() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx) return
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const size = () => {
      c.width = c.clientWidth * dpr
      c.height = c.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = []
    const still = prefersReducedMotion()
    const t0 = performance.now()
    let raf = 0
    const draw = (now: number) => {
      const w = c.clientWidth
      const h = c.clientHeight
      const t = still ? 3.2 : (now - t0) / 1000
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      const reveal = Math.min(1, t / 2.6)
      const N = 140
      const pts: [number, number][] = []
      for (let i = 0; i <= N; i++) {
        const k = i / N
        if (k > reveal) break
        const y = h * (1.05 - k * 0.95)
        const x = w * 0.5 + Math.sin(k * Math.PI * 3.4 - t * 1.6) * w * 0.26 * (1 - k * 0.45) + Math.sin(k * 9 + t) * 10
        pts.push([x, y])
      }
      // three passes: wide haze, body, white-hot core; thicker toward the head
      for (const [width, color] of [[46, 'rgba(255,140,40,0.05)'], [18, 'rgba(255,190,90,0.16)'], [5, 'rgba(255,248,225,0.7)']] as const) {
        for (let i = 1; i < pts.length; i++) {
          const k = i / N
          ctx.strokeStyle = color
          ctx.lineWidth = width * (0.35 + k * 0.9)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(pts[i - 1][0], pts[i - 1][1])
          ctx.lineTo(pts[i][0], pts[i][1])
          ctx.stroke()
        }
      }
      // head: a hot bloom with two horn-like streaks
      const head = pts[pts.length - 1]
      if (head) {
        const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 70)
        g.addColorStop(0, 'rgba(255,255,240,0.95)')
        g.addColorStop(0.3, 'rgba(255,180,70,0.5)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(head[0], head[1], 70, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,230,170,0.7)'
        ctx.lineWidth = 2.5
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(head[0], head[1] - 10)
          ctx.quadraticCurveTo(head[0] + s * 26, head[1] - 46, head[0] + s * 18, head[1] - 74)
          ctx.stroke()
        }
        if (!still && Math.random() < 0.9) {
          const p = pts[Math.floor(Math.random() * pts.length)]
          sparks.push({ x: p[0], y: p[1], vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 50, life: 1 })
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life -= 0.016
        s.x += s.vx * 0.016
        s.y += s.vy * 0.016
        if (s.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        ctx.fillStyle = `rgba(255,210,130,${s.life})`
        ctx.fillRect(s.x, s.y, 2, 2)
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    addEventListener('resize', size)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
    }
  }, [])
  return <canvas ref={ref} className="energy-dragon" aria-hidden="true" />
}
