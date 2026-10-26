// Spec §4: the score must never flatter. These checks read the job posts themselves,
// not the scorer's own output, so a scorer that misses a requirement can't hide it.
import { describe, expect, it } from 'vitest'
import type { Job } from '../domain/types'
import jobs from './fixtures/jobs.json'
import raw from './fixtures/raw.json'

type Raw = { slug: string; requirements: { text: string; priority: string }[] }
const posts = new Map((raw as Raw[]).map((r) => [r.slug, r]))
const all = jobs as Job[]

const YEARS = /(\d+)\s*(?:\+|-|–|to)?\s*(?:\d+\s*)?\+?\s*years?/i
const SOFT = /motivat|team player|communicat|english|hebrew|learn|passion|curious|proactive|responsib|initiative|mindset|attitude|self[- ]|independent|detail|problem[- ]solving|collaborat|ownership|eager|drive|interpersonal|quick/i
const DEGREE = /degree|b\.?sc|bachelor|gpa|student|graduate|academic|transcript|grades/i

function requiredYears(j: Job): number {
  return Math.max(0, ...posts.get(j.id)!.requirements.filter((r) => r.priority === 'required').map((r) => Number(r.text.match(YEARS)?.[1] ?? 0)))
}

describe('fixture honesty', () => {
  it('never lets a job that requires 3+ years past 9,000', () => {
    for (const j of all) if (requiredYears(j) >= 3) expect(j.score.total, `${j.title}: ${j.score.total}`).toBeLessThanOrEqual(9000)
  })

  it('never claims you meet an experience bar the post sets higher than yours', () => {
    for (const j of all) {
      const exp = j.score.lines.find((l) => l.kind === 'experience')!
      if (requiredYears(j) > 2) {
        expect(exp.points, `${j.title}: ${exp.label}`).toBeLessThan(0)
        expect(exp.evidence?.quote, j.title).toMatch(YEARS)
      }
    }
  })

  it('gives every hard requirement a line, scored or not', () => {
    for (const j of all) {
      const quoted = new Set(j.score.lines.map((l) => l.evidence?.quote))
      for (const r of posts.get(j.id)!.requirements) {
        if (r.priority !== 'required' || r.text.length <= 6 || SOFT.test(r.text) || YEARS.test(r.text) || DEGREE.test(r.text)) continue
        expect(quoted.has(r.text), `${j.title}: "${r.text}"`).toBe(true)
      }
    }
  })

  it('awards no free points: seniority and location are neutral, nothing scores without a quote', () => {
    for (const j of all) {
      expect(j.score.lines.some((l) => /no hard skills/i.test(l.label)), j.title).toBe(false)
      for (const l of j.score.lines) {
        if (l.kind === 'seniority' && ['junior', 'intern', 'unlabeled'].includes(j.seniority)) expect(l.points, j.title).toBe(0)
        if (l.kind === 'location') expect(l.points, j.title).toBeLessThanOrEqual(0)
        if (l.points > 0) expect(l.evidence?.quote, `${j.title}: ${l.label}`).toBeTruthy()
      }
    }
  })
})
