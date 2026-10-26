import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sfx from '../audio/sfx'
import * as api from '../data/api'
import { SettingsScreen } from './SettingsScreen'

describe('SettingsScreen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.restoreAllMocks()
    api.__reset()
  })

  it('reflects the muted sound setting and turns sound on', async () => {
    vi.spyOn(sfx, 'isMuted').mockReturnValue(true)
    const setMuted = vi.spyOn(sfx, 'setMuted').mockImplementation(() => {})
    vi.spyOn(sfx, 'play').mockImplementation(() => {})
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch', { name: 'Sound effects' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(setMuted).toHaveBeenCalledWith(false)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the alert threshold from the saved profile', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByRole('spinbutton', { name: 'Alert me above' })).toHaveValue(9000)
  })

  it('hides Jerusalem and the south by default', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByRole('switch', { name: 'Show Jerusalem and south' })).toHaveAttribute('aria-checked', 'false')
  })

  it('lists every skill the scouter knows, with its display name', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByRole('combobox', { name: 'Node.js level' })).toHaveValue('proven')
    expect(screen.getByRole('combobox', { name: 'Kubernetes level' })).toHaveValue('none')
  })

  it('saving a skill level saves the profile and keeps it', async () => {
    const save = vi.spyOn(api, 'saveProfile')
    const { unmount } = render(<SettingsScreen />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Python level' }), { target: { value: 'proven' } })
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ skills: expect.objectContaining({ python: 'proven' }) })))
    unmount()
    render(<SettingsScreen />)
    expect(await screen.findByRole('combobox', { name: 'Python level' })).toHaveValue('proven')
  })

  it('removes a skill set to not yet', async () => {
    const save = vi.spyOn(api, 'saveProfile')
    render(<SettingsScreen />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Java level' }), { target: { value: 'none' } })
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].skills).not.toHaveProperty('java')
  })

  it('keeps the daily scan off until it is switched on, and remembers it', async () => {
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch', { name: 'Daily scan' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(await api.getScanSettings()).toEqual({ autoScan: true })
  })

  it('offers a one-off scan and says when it needs the backend', async () => {
    render(<SettingsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Scan now' }))
    expect(await screen.findByText('Scanning needs the backend running.')).toBeInTheDocument()
  })
})
