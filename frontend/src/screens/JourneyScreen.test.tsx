import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sfx from '../audio/sfx'
import { __reset, applyToJob, listJobs, moveStage } from '../data/api'
import type { Stage } from '../domain/types'
import { JourneyScreen } from './JourneyScreen'

function mount() {
  return render(
    <MemoryRouter>
      <JourneyScreen />
    </MemoryRouter>,
  )
}
const earned = (c: HTMLElement) => c.querySelectorAll('[data-earned="true"]').length

describe('JourneyScreen', () => {
  let play: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    __reset()
    play = vi.spyOn(sfx, 'play').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts with no applications and seven stone balls', async () => {
    const { container } = mount()
    expect(await screen.findByText('No applications yet')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-earned]')).toHaveLength(7)
    expect(earned(container)).toBe(0)
  })

  it('moving an application to HR call lights the three-star ball with a chime', async () => {
    const [job] = await listJobs()
    await applyToJob(job.id)
    const { container } = mount()
    const select = await screen.findByRole('combobox', { name: `Stage for ${job.title} at ${job.company}` })
    fireEvent.change(select, { target: { value: 'hr_call' } })
    fireEvent.click(screen.getByRole('button', { name: `Save stage for ${job.title} at ${job.company}` }))
    await screen.findByText(/2 of 7/)
    expect(container.querySelector('[data-star="3"]')).toHaveAttribute('data-earned', 'true')
    expect(play).toHaveBeenCalledWith('chime')
  })

  it('arrowing through the stage list saves nothing until you press Save', async () => {
    const [job] = await listJobs()
    await applyToJob(job.id)
    const { container } = mount()
    const select = await screen.findByRole('combobox', { name: `Stage for ${job.title} at ${job.company}` })
    for (const s of ['hr_call', 'tech_interview', 'home_task', 'final_interview', 'offer', 'rejected'] as Stage[]) fireEvent.change(select, { target: { value: s } })
    expect(earned(container)).toBe(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Save stage for ${job.title} at ${job.company}` }))
    await screen.findByText(/1 of 7/)
    expect(earned(container)).toBe(1)
  })

  it('Escape closes the wish', async () => {
    const jobs = await listJobs()
    for (const j of jobs.slice(0, 10)) await applyToJob(j.id)
    const first = (await applyToJob(jobs[0].id)).id
    for (const s of ['hr_call', 'tech_interview', 'home_task', 'final_interview', 'offer'] as Stage[]) await moveStage(first, s)
    mount()
    const dialog = await screen.findByRole('dialog', { name: 'Your wish is granted' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('collecting all seven grants the wish', async () => {
    const jobs = await listJobs()
    for (const j of jobs.slice(0, 10)) await applyToJob(j.id)
    const first = (await applyToJob(jobs[0].id)).id
    for (const s of ['hr_call', 'tech_interview', 'home_task', 'final_interview', 'offer'] as Stage[]) await moveStage(first, s)
    mount()
    expect(await screen.findByRole('dialog', { name: 'Your wish is granted' })).toBeInTheDocument()
    expect(play).toHaveBeenCalledWith('fanfare')
  })
})
