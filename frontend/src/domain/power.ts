import type { Score } from './types'

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatPower(n: number): string {
  return grouped.format(Math.max(0, Math.round(n)))
}

/** Strictly greater than 9000, as the scouter would say. */
export function isOver9000(n: number): boolean {
  return n > 9000
}

/** The score the job would have if `skill` were proven. */
export function simulateTraining(score: Score, skill: string): number {
  const line = score.lines.find((l) => l.skill === skill)
  return score.total + (line?.trainGain ?? 0)
}

/** The score in plain words, for anyone who hasn't watched Dragon Ball Z. */
export function matchTier(n: number): 'Long shot' | 'Partial match' | 'Strong match' | 'Top match' {
  if (isOver9000(n)) return 'Top match'
  if (n >= 7000) return 'Strong match'
  if (n >= 4000) return 'Partial match'
  return 'Long shot'
}
