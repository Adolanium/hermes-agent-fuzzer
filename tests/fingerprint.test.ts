import { describe, expect, it } from 'vitest'

import { fingerprintOf, normalizeStack, similarAlert, stackTop5 } from '../src/findings/fingerprint.ts'
import type { Failure } from '../src/types.ts'

describe('fingerprint', () => {
  it('strips paths, addresses, and ids from stacks', () => {
    const raw = 'Error at C:\\Developer\\Hermes\\apps\\desktop\\src\\app.ts:12\n    at 0x7ffabc\n    session 11111111-1111-1111-1111-111111111111'
    const normalized = normalizeStack(raw)
    expect(normalized).not.toContain('Developer')
    expect(normalized).not.toContain('0x7ffabc')
    expect(normalized).toContain('<id>')
    expect(stackTop5(raw).split('\n').length).toBeLessThanOrEqual(5)
  })

  it('groups the same crash class and stack', () => {
    const a: Failure = {
      class: 'pageerror',
      severity: 'hard',
      message: 'boom',
      stack: 'Error: boom\n    at foo',
      route: '/settings',
    }
    const b: Failure = { ...a }
    expect(fingerprintOf(a)).toBe(fingerprintOf(b))
  })

  it('treats similar alerts as related', () => {
    expect(similarAlert('Resume failed for session abc', 'Resume failed for session xyz')).toBe(true)
    expect(similarAlert('Resume failed', 'Unrelated toast about theme')).toBe(false)
  })
})
