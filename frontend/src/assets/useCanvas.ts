import { useEffect, useRef } from 'react'

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A DPR-aware canvas that fills its parent, redraws on resize, and runs `draw`
 * every frame only while on screen. Under reduced motion it draws one still frame.
 */
export function useCanvas(draw: DrawFn, animate = true) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let visible = true
    let w = 0
    let h = 0
    const still = !animate || prefersReducedMotion()
    const t0 = performance.now()

    const size = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const frame = (now: number) => {
      drawRef.current(ctx, w, h, still ? 0 : (now - t0) / 1000)
      if (!still && visible) raf = requestAnimationFrame(frame)
    }
    size()
    frame(t0)

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { size(); if (still) frame(t0) }) : null
    ro?.observe(canvas)
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([e]) => {
            const was = visible
            visible = e.isIntersecting
            if (visible && !was && !still) raf = requestAnimationFrame(frame)
          })
        : null
    io?.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
    }
  }, [animate])

  return ref
}

/** Deterministic pseudo-random, so worlds look the same on every load. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
