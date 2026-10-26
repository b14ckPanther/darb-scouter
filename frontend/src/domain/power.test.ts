import { describe, expect, it } from 'vitest'
import { formatPower, isOver9000, simulateTraining } from './power'
import type { Score } from './types'

describe('formatPower', () => {
  it('groups thousands', () => expect(formatPower(8742)).toBe('8,742'))
  it('clamps negatives to 0', () => expect(formatPower(-50)).toBe('0'))
  it('shows values above 10,000 in full', () => expect(formatPower(10240)).toBe('10,240'))
})

describe('isOver9000', () => {
  it('is false at exactly 9000', () => expect(isOver9000(9000)).toBe(false))
  it('is true at 9001', () => expect(isOver9000(9001)).toBe(true))
  it('is true above 10,000', () => expect(isOver9000(10240)).toBe(true))
})

describe('simulateTraining', () => {
  const score: Score = {
    total: 8742,
    lines: [
      { kind: 'must', label: 'React', points: 1800, skill: 'react' },
      { kind: 'must', label: 'AWS SQS', points: 0, skill: 'aws-sqs', trainGain: 260 },
    ],
  }
  it('adds the gain of the trained skill', () => expect(simulateTraining(score, 'aws-sqs')).toBe(9002))
  it('leaves the total unchanged for an unknown skill', () => expect(simulateTraining(score, 'cobol')).toBe(8742))
})

describe('matchTier', () => {
  it('names each band in plain words', async () => {
    const { matchTier } = await import('./power')
    expect(matchTier(2500)).toBe('Long shot')
    expect(matchTier(5600)).toBe('Partial match')
    expect(matchTier(8424)).toBe('Strong match')
    expect(matchTier(9000)).toBe('Strong match')
    expect(matchTier(9001)).toBe('Top match')
  })
})
