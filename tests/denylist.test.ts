import { describe, expect, it } from 'vitest'

import { denyReason, isDenied } from '../src/safety/denylist.ts'

describe('denylist', () => {
  it('blocks outbound and update actions', () => {
    expect(isDenied('Send diagnostics', 'click', false)).toBe(true)
    expect(isDenied('Check for updates', 'click', false)).toBe(true)
    expect(isDenied('Connect with Google', 'click', false)).toBe(true)
    expect(denyReason('Install from git URL', 'click', false)).toBe('outbound')
  })

  it('blocks typing into a terminal', () => {
    expect(denyReason('Terminal 1', 'type', false)).toBe('terminal-type')
    expect(isDenied('Terminal 1', 'click', false)).toBe(false)
  })

  it('allows everything when unsafe surfaces are on', () => {
    expect(isDenied('Send diagnostics', 'click', true)).toBe(false)
    expect(isDenied('xterm', 'type', true)).toBe(false)
  })

  it('allows ordinary chat controls', () => {
    expect(isDenied('New session', 'click', false)).toBe(false)
    expect(isDenied('composer', 'type', false)).toBe(false)
  })
})
