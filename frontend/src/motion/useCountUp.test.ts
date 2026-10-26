import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from './useCountUp'

describe('useCountUp', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the target on first render under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    )
    const { result } = renderHook(() => useCountUp(8742))
    expect(result.current).toBe(8742)
  })

  it('starts from `from` when motion is allowed', () => {
    const { result } = renderHook(() => useCountUp(8742, { from: 0 }))
    expect(result.current).toBe(0)
  })
})
