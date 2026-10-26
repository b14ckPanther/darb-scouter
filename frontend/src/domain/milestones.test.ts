import { describe, expect, it } from 'vitest'
import { deriveMilestones } from './milestones'
import type { Application, Stage } from './types'

function app(id: string, path: [Stage, string][]): Application {
  return { id, jobId: id, stage: path[path.length - 1][0], history: path.map(([stage, at]) => ({ stage, at })), notes: '' }
}

describe('deriveMilestones', () => {
  it('always returns the seven milestones, unearned when there are no applications', () => {
    const m = deriveMilestones([])
    expect(m.map((x) => x.star)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(m.every((x) => x.earnedAt === null)).toBe(true)
  })

  it('ten applications earn stars 1 and 2 only', () => {
    const apps = Array.from({ length: 10 }, (_, i) => app(`a${i}`, [['applied', `2026-10-${10 + i}T09:00:00Z`]]))
    const m = deriveMilestones(apps)
    expect(m.filter((x) => x.earnedAt).map((x) => x.star)).toEqual([1, 2])
    expect(m[0].earnedAt).toBe('2026-10-10T09:00:00Z')
    expect(m[1].earnedAt).toBe('2026-10-19T09:00:00Z')
  })

  it('applied → hr call → tech interview earns 1, 3 and 4, dated from history', () => {
    const m = deriveMilestones([
      app('x', [
        ['applied', '2026-10-01T09:00:00Z'],
        ['hr_call', '2026-10-05T09:00:00Z'],
        ['tech_interview', '2026-10-09T09:00:00Z'],
      ]),
    ])
    expect(m.filter((x) => x.earnedAt).map((x) => x.star)).toEqual([1, 3, 4])
    expect(m[2].earnedAt).toBe('2026-10-05T09:00:00Z')
  })

  it('a saved job that was never sent earns nothing', () => {
    expect(deriveMilestones([app('s', [['saved', '2026-10-01T09:00:00Z']])]).some((x) => x.earnedAt)).toBe(false)
  })
})
