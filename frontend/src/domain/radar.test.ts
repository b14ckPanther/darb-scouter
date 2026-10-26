import { describe, expect, it } from 'vitest'
import { blipPosition } from './radar'

const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y)

describe('blipPosition', () => {
  it('puts a perfect match near the centre', () => expect(radius(blipPosition(10000, 0))).toBeCloseTo(0.15, 2))
  it('puts a zero score at the rim', () => expect(radius(blipPosition(0, 3))).toBeCloseTo(1, 2))
  it('clamps scores above 10,000 and below 0', () => {
    expect(radius(blipPosition(12000, 1))).toBeCloseTo(0.15, 2)
    expect(radius(blipPosition(-500, 1))).toBeCloseTo(1, 2)
  })
  it('spreads jobs with equal scores to different angles', () => {
    const a = blipPosition(8000, 0)
    const b = blipPosition(8000, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.1)
  })
})
