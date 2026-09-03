import { describe, expect, it } from 'vitest'

import { composerLooksSendable } from '../src/driver/chat.ts'

describe('composer sendable', () => {
  it('waits out gateway boot copy and a locked editor', () => {
    expect(composerLooksSendable('true', 'Message Hermes')).toBe(true)
    expect(composerLooksSendable('true', 'Starting Hermes...')).toBe(false)
    expect(composerLooksSendable('true', 'Reconnecting to Hermes…')).toBe(false)
    expect(composerLooksSendable('false', 'Message Hermes')).toBe(false)
  })
})
