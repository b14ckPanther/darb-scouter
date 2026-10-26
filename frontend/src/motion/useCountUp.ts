import { useEffect, useRef, useState } from 'react'

function reduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A number that races toward `target` the way a scouter reading does: fast, jittery,
 * then settling. Re-targets smoothly from wherever it is. Reduced motion jumps straight there.
 */
export function useCountUp(
  target: number,
  opts: { durationMs?: number; jitter?: number; from?: number; onTick?: () => void } = {},
): number {
  const { durationMs = 1800, jitter = 220, from = 0 } = opts
  const [value, setValue] = useState(() => (reduced() ? target : from))
  const current = useRef(value)
  const tick = useRef(opts.onTick)
  tick.current = opts.onTick

  useEffect(() => {
    if (reduced()) {
      current.current = target
      setValue(target)
      return
    }
    const start = current.current
    const t0 = performance.now()
    let raf = 0
    let lastTick = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs)
      const e = 1 - Math.pow(1 - k, 4)
      const shake = k < 0.97 ? (Math.random() - 0.5) * jitter * (1 - k) : 0
      const v = k === 1 ? target : Math.round(start + (target - start) * e + shake)
      current.current = v
      setValue(v)
      if (now - lastTick > 70 && k < 1) {
        lastTick = now
        tick.current?.()
      }
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, jitter])

  return value
}
