import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { __reset, __setFixtureJobs, __setLastScan } from '../data/api'
import { RadarScreen } from './RadarScreen'

function mount() {
  return render(
    <MemoryRouter>
      <RadarScreen />
    </MemoryRouter>,
  )
}

describe('RadarScreen', () => {
  afterEach(() => __reset())

  it('shows the empty state when the radar found nothing', async () => {
    __setFixtureJobs([])
    mount()
    expect(await screen.findByText('Radar found nothing tonight')).toBeInTheDocument()
  })

  it('shows the empty state when the last scan found nothing new, even with older jobs on file', async () => {
    __setLastScan('2026-10-27T04:00:00Z')
    mount()
    expect(await screen.findByText('Radar found nothing tonight')).toBeInTheDocument()
  })

  it('labels the scan with its real date', async () => {
    mount()
    expect(await screen.findByText(/Sun 25 Oct · 07:00 scan/i)).toBeInTheDocument()
  })

  it('announces last night’s finds and lists them as links', async () => {
    mount()
    expect(await screen.findByRole('heading', { level: 1, name: /3 new jobs found overnight/ })).toBeInTheDocument()
    const finds = screen.getByRole('complementary', { name: 'Found overnight' })
    expect(finds.querySelectorAll('li a')).toHaveLength(3)
  })

  it('makes every blip a keyboard-reachable button named after its job', async () => {
    mount()
    const blips = await screen.findAllByRole('button', { name: /match \d[\d,]* out of 10,000/ })
    expect(blips.length).toBeGreaterThanOrEqual(15)
  })
})

describe('RadarScreen sources', () => {
  afterEach(() => __reset())

  it('says out loud when a source failed in the last scan', async () => {
    mount()
    expect(await screen.findByText(/ats scan failed/i)).toBeInTheDocument()
  })
})
