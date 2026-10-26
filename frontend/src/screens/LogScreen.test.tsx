import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __reset, __setFixtureJobs } from '../data/api'
import type { Job } from '../domain/types'
import { LogScreen } from './LogScreen'

const job = (id: string, city: string, total: number): Job => ({
  id, title: `Developer ${id}`, company: `Co ${id}`, city, workMode: 'hybrid', url: '#', postedAt: '2026-10-20T00:00:00Z',
  foundAt: '2026-10-24T00:00:00Z', seniority: 'junior', score: { total, lines: [] },
})

function rows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('LogScreen', () => {
  beforeEach(() => __setFixtureJobs([job('a', 'Tel Aviv', 7200), job('b', 'Haifa', 9400), job('c', 'Haifa', 6100), job('d', 'Herzliya', 9050)]))
  afterEach(() => __reset())

  const mount = () =>
    render(
      <MemoryRouter>
        <LogScreen />
      </MemoryRouter>,
    )

  it('sorts by match, highest first', async () => {
    mount()
    await screen.findByText('Developer b')
    expect(rows().map((r) => within(r).getAllByRole('cell')[0].firstChild?.textContent)).toEqual(['9,400', '9,050', '7,200', '6,100'])
  })

  it('searching a city leaves only that city', async () => {
    mount()
    await screen.findByText('Developer b')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search jobs' }), { target: { value: 'Haifa' } })
    expect(rows()).toHaveLength(2)
    expect(rows().every((r) => r.textContent?.includes('Haifa'))).toBe(true)
  })

  it('the over-9,000 filter shows only jobs above 9,000', async () => {
    mount()
    await screen.findByText('Developer b')
    fireEvent.change(screen.getByRole('combobox', { name: 'Match' }), { target: { value: '9000' } })
    expect(rows()).toHaveLength(2)
  })

  it('says so when nothing matches', async () => {
    mount()
    await screen.findByText('Developer b')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search jobs' }), { target: { value: 'Eilat' } })
    expect(screen.getByText('No jobs match. Clear the search or lower the power filter.')).toBeInTheDocument()
  })
})

describe('LogScreen paste a link', () => {
  afterEach(() => __reset())

  it('asks for pasted text when a link is blocked', async () => {
    render(
      <MemoryRouter>
        <LogScreen />
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByRole('textbox', { name: 'Job link' }), { target: { value: 'https://www.linkedin.com/jobs/view/1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Scan link' }))
    expect(await screen.findByRole('textbox', { name: 'Job text' })).toBeInTheDocument()
    expect(screen.getByText(/paste the job text/i)).toBeInTheDocument()
  })
})
