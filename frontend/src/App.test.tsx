import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from './App'

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('App shell', () => {
  it('renders nav with all five screens', () => {
    at('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const name of ['Radar', 'Scouter log', 'Journey', 'Settings']) {
      expect(nav).toContainElement(screen.getByRole('link', { name }))
    }
  })

  it('shows the job-missing screen for an unknown job id', async () => {
    at('/job/nope')
    expect(await screen.findByText(/couldn't read this/)).toBeInTheDocument()
  })
})
