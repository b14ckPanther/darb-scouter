import { beforeEach, describe, expect, it } from 'vitest'
import jobs from './fixtures/jobs.json'
import type { Job } from '../domain/types'
import { __reset, applyToJob, getJob, listApplications, listJobs, moveStage } from './api'

describe('fixture data', () => {
  const all = jobs as Job[]
  it('has about 20 jobs', () => expect(all.length).toBeGreaterThanOrEqual(15))

  it('never lets a 3+ years job past 9,000', () => {
    for (const j of all) {
      const exp = j.score.lines.find((l) => l.kind === 'experience')
      if (exp && exp.points <= -1500) expect(j.score.total, j.title).toBeLessThanOrEqual(9000)
    }
  })

  it('quotes evidence for every skill line', () => {
    for (const j of all)
      for (const l of j.score.lines.filter((x) => (x.kind === 'must' || x.kind === 'nice') && x.skill))
        expect(l.evidence?.quote, `${j.title}: ${l.label}`).toBeTruthy()
  })

  it('totals add up to the sum of their lines', () => {
    for (const j of all) expect(j.score.total).toBe(Math.max(0, j.score.lines.reduce((a, l) => a + l.points, 0)))
  })

  it('contains no defense companies', () => {
    for (const j of all) expect(j.company).not.toMatch(/elbit|rafael|iai|xtend|sentrycs/i)
  })
})

describe('api', () => {
  beforeEach(() => __reset())

  it('lists jobs sorted by power level, highest first', async () => {
    const list = await listJobs()
    expect(list[0].score.total).toBeGreaterThanOrEqual(list[list.length - 1].score.total)
  })

  it('filters by found time and minimum score', async () => {
    const all = await listJobs()
    const since = await listJobs({ sinceFoundAt: '2026-10-25T00:00:00Z' })
    expect(since.length).toBeLessThan(all.length)
    expect((await listJobs({ minScore: 9000 })).every((j) => j.score.total >= 9000)).toBe(true)
  })

  it('applies to a job and moves it through stages with history', async () => {
    const [job] = await listJobs()
    const a = await applyToJob(job.id)
    expect((await listApplications()).map((x) => x.jobId)).toContain(job.id)
    expect(a.stage).toBe('applied')
    const moved = await moveStage(a.id, 'hr_call')
    expect(moved.history.map((h) => h.stage)).toEqual(['applied', 'hr_call'])
    expect(await getJob(job.id)).toBeDefined()
  })

  it('applying twice keeps one application', async () => {
    const [job] = await listJobs()
    await applyToJob(job.id)
    await applyToJob(job.id)
    expect((await listApplications()).filter((a) => a.jobId === job.id)).toHaveLength(1)
  })
})
