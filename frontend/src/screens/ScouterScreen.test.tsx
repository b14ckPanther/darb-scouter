import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __reset, __setFixtureJobs } from '../data/api'
import type { Job } from '../domain/types'
import { ScouterScreen } from './ScouterScreen'

const base: Omit<Job, 'id' | 'title' | 'score'> = {
  company: 'Artlist', city: 'Tel Aviv', workMode: 'onsite', url: 'https://example.com', postedAt: '2026-10-25T00:00:00Z',
  foundAt: '2026-10-25T05:00:00Z', seniority: 'junior',
}
const gapJob: Job = {
  ...base, id: 'gap', title: 'Junior Full Stack Developer',
  score: { total: 8742, lines: [
    { kind: 'must', label: 'React', skill: 'react', points: 3000, evidence: { quote: 'Solid Node.js and React', display: 'Solid Node.js and React', source: 'freehire' } },
    { kind: 'must', label: 'AWS SQS', skill: 'aws-sqs', points: 0, trainGain: 260, evidence: { quote: 'Familiarity with AWS (SQS / SNS)', display: 'Familiarity with AWS (SQS / SNS)', source: 'post' } },
    { kind: 'experience', label: 'No experience minimum', points: 5742 },
  ] },
}
const perfect: Job = { ...base, id: 'perfect', title: 'Junior React Developer', score: { total: 9100, lines: [
  { kind: 'must', label: 'React', skill: 'react', points: 9100, evidence: { quote: 'Knowledge of Reactjs', display: 'Knowledge of Reactjs', source: 'freehire' } },
] } }
const hebrew: Job = { ...base, id: 'he', title: 'מפתח/ת פולסטאק ג׳וניור', score: { total: 7000, lines: [] } }

function mount(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/job/${id}`]}>
      <Routes>
        <Route path="/job/:id" element={<ScouterScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScouterScreen', () => {
  beforeEach(() => {
    __setFixtureJobs([gapJob, perfect, hebrew])
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    )
  })
  afterEach(() => {
    __reset()
    vi.restoreAllMocks()
  })

  it('says there is nothing to train when every skill matches', async () => {
    mount('perfect')
    expect(await screen.findByText('Nothing to train. You match every listed skill.')).toBeInTheDocument()
  })

  it('training a gap raises the power level past 9,000 and cracks the lens', async () => {
    const { container } = mount('gap')
    fireEvent.click(await screen.findByRole('button', { name: 'Train AWS SQS' }))
    expect(await screen.findByText('9,002')).toBeInTheDocument()
    expect(container.querySelector('[data-over9000]')).toHaveAttribute('data-over9000', 'true')
  })

  it('lets a Hebrew title choose its own direction', async () => {
    mount('he')
    expect(await screen.findByRole('heading', { level: 1, name: hebrew.title })).toHaveAttribute('dir', 'auto')
  })

  it('reveals each line’s evidence and says where it came from', async () => {
    mount('gap')
    fireEvent.click(await screen.findByRole('button', { name: /AWS SQS.*\+260/ }))
    expect(screen.getByText('Familiarity with AWS (SQS / SNS)')).toBeInTheDocument()
    expect(screen.getByText('from the post')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /React/ }))
    expect(screen.getByText('from FreeHire')).toBeInTheDocument()
  })

  it('applies to the job', async () => {
    mount('gap')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('button', { name: 'Applied' })).toBeDisabled()
  })

  it('does not crack the lens until the reading actually arrives', async () => {
    vi.restoreAllMocks() // motion allowed
    const { container } = mount('perfect')
    await screen.findByRole('heading', { level: 1 })
    expect(container.querySelector('[data-over9000]')).toHaveAttribute('data-over9000', 'false')
  })

  it('announces only the settled reading to screen readers', async () => {
    const { container } = mount('gap')
    const live = await screen.findByText('Match 8,742 out of 10,000: Strong match')
    expect(live).toHaveAttribute('role', 'status')
    expect(container.querySelector('.hs-num')).not.toHaveAttribute('aria-live')
  })

  it('cracks once per job: training an already-cracked reading does not replay the crack', async () => {
    const sfx = await import('../audio/sfx')
    const play = vi.spyOn(sfx, 'play').mockImplementation(() => {})
    __setFixtureJobs([{ ...gapJob, id: 'hot', score: { ...gapJob.score, total: 9300 } }])
    mount('hot')
    await screen.findByText('9,300')
    fireEvent.click(screen.getByRole('button', { name: 'Train AWS SQS' }))
    await screen.findByText('9,560')
    expect(play.mock.calls.filter(([n]) => n === 'crack')).toHaveLength(1)
  })

  it('explains the number in plain words', async () => {
    mount('gap')
    expect(await screen.findByText('Match')).toBeInTheDocument()
    expect(screen.getByText('/ 10,000')).toBeInTheDocument()
    expect(screen.getByText('Strong match')).toBeInTheDocument()
    expect(screen.getByText('How well your skills fit this job. Over 9,000 is a top match.')).toBeInTheDocument()
  })

  it('says so when the job does not exist', async () => {
    mount('nope')
    expect(await screen.findByText(/couldn't read this/)).toBeInTheDocument()
  })
})
