import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function freshSfx() {
  vi.resetModules()
  return import('./sfx')
}

describe('sfx', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('is muted on a fresh store', async () => {
    const sfx = await freshSfx()
    expect(sfx.isMuted()).toBe(true)
  })

  it('remembers unmuting across module instances', async () => {
    ;(await freshSfx()).setMuted(false)
    expect((await freshSfx()).isMuted()).toBe(false)
  })

  it('never builds an AudioContext while muted', async () => {
    const ctor = vi.fn()
    vi.stubGlobal('AudioContext', ctor)
    const sfx = await freshSfx()
    sfx.play('beep')
    expect(ctor).not.toHaveBeenCalled()
  })

  it('stays silent and quiet when the browser blocks audio', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('blocked before user gesture')
      }),
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sfx = await freshSfx()
    sfx.setMuted(false)
    expect(() => sfx.play('beep')).not.toThrow()
    expect(err).not.toHaveBeenCalled()
  })

  it('schedules nothing while the browser keeps audio suspended, so nothing bursts out later', async () => {
    const createOscillator = vi.fn()
    const resume = vi.fn(() => Promise.resolve())
    vi.stubGlobal('AudioContext', vi.fn(() => ({ state: 'suspended', resume, createOscillator, createGain: vi.fn(), currentTime: 0 })))
    const sfx = await freshSfx()
    sfx.setMuted(false)
    for (let i = 0; i < 30; i++) sfx.play('tick')
    expect(createOscillator).not.toHaveBeenCalled()
    expect(resume).toHaveBeenCalled()
  })
})
