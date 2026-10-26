import { afterEach, describe, expect, it, vi } from 'vitest'

describe('canUseWebGL', () => {
  afterEach(() => vi.restoreAllMocks())

  it('probes once, then releases the probe context', async () => {
    const loseContext = vi.fn()
    const gl = { getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext } : null) }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => gl) as never)
    vi.resetModules()
    const { canUseWebGL } = await import('./heroScene')
    expect(canUseWebGL()).toBe(true)
    expect(canUseWebGL()).toBe(true)
    expect(canUseWebGL()).toBe(true)
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })
})
