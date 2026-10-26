import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sfx from '../audio/sfx'
import { SettingsScreen } from './SettingsScreen'

describe('SettingsScreen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('reflects the muted sound setting and turns sound on', () => {
    vi.spyOn(sfx, 'isMuted').mockReturnValue(true)
    const setMuted = vi.spyOn(sfx, 'setMuted').mockImplementation(() => {})
    vi.spyOn(sfx, 'play').mockImplementation(() => {})
    render(<SettingsScreen />)
    const toggle = screen.getByRole('switch', { name: 'Sound effects' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(setMuted).toHaveBeenCalledWith(false)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('alerts above 9,000 by default', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('spinbutton', { name: 'Alert me above' })).toHaveValue(9000)
  })

  it('hides Jerusalem and the south by default', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('switch', { name: 'Show Jerusalem and south' })).toHaveAttribute('aria-checked', 'false')
  })

  it('changes a skill level and remembers it', () => {
    const { unmount } = render(<SettingsScreen />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Python level' }), { target: { value: 'proven' } })
    unmount()
    render(<SettingsScreen />)
    expect(screen.getByRole('combobox', { name: 'Python level' })).toHaveValue('proven')
  })
})
