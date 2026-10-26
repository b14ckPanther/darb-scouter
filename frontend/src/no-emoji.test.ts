/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Emoji and text glyphs standing in for icons are forbidden in the product (icons are Solar SVGs).
const FORBIDDEN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{25A0}-\u{25FF}]/u

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|html|json)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

describe('no emoji or glyph icons', () => {
  it('keeps them out of every source file the app ships', () => {
    const offenders = files('src')
      .filter((f) => !f.includes('fixtures/raw.json'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .flatMap((line: string, i: number) => (FORBIDDEN.test(line) ? [`${f}:${i + 1}: ${line.trim().slice(0, 80)}`] : [])),
      )
    expect(offenders).toEqual([])
  })
})
