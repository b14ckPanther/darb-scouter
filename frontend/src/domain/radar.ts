const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/**
 * Where a job sits on the radar, in [-1, 1] from the centre.
 * Better matches sit closer to you; the golden angle keeps equal scores apart.
 */
export function blipPosition(score: number, index: number): { x: number; y: number } {
  const k = Math.min(10000, Math.max(0, score)) / 10000
  const r = 1 - k * 0.85
  const a = index * GOLDEN - Math.PI / 2
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}
