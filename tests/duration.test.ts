import { describe, expect, it } from 'vitest'

import { parseDuration } from '../src/campaign/duration.ts'

describe('parseDuration', () => {
  it('parses hours minutes and seconds', () => {
    expect(parseDuration('8h')).toBe(8 * 3600 * 1000)
    expect(parseDuration('3m')).toBe(180_000)
    expect(parseDuration('30s')).toBe(30_000)
    expect(parseDuration('500')).toBe(500)
  })

  it('rejects junk', () => {
    expect(() => parseDuration('forever')).toThrow(/Bad duration/)
  })
})
