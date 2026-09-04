import { runInNewContext } from 'node:vm'
import type { Page } from 'playwright'
import { describe, expect, it } from 'vitest'

import { composerSendable } from '../src/driver/chat.ts'

function pageWithEditor(attributes: Record<string, string> | null): Page {
  return {
    evaluate: async (fn: Function) => runInNewContext(`(${fn.toString()})()`, {
      document: {
        querySelector: (selector: string) => selector === '[data-slot="composer-rich-input"]' && attributes
          ? { getAttribute: (name: string) => attributes[name] ?? null }
          : null,
      },
    }),
  } as unknown as Page
}

describe('composer sendable', () => {
  it('waits out gateway boot copy and a locked editor', async () => {
    for (const [editable, placeholder, expected] of [
      ['true', 'Message Hermes', true],
      ['true', 'Starting Hermes...', false],
      ['true', 'RECONNECTING to Hermes...', false],
      ['false', 'Message Hermes', false],
    ] as const) {
      const page = pageWithEditor({ contenteditable: editable, 'data-placeholder': placeholder })
      expect(await composerSendable(page)).toBe(expected)
    }
  })

  it('handles an absent editor and missing attributes', async () => {
    expect(await composerSendable(pageWithEditor(null))).toBe(false)
    expect(await composerSendable(pageWithEditor({}))).toBe(true)
  })
})
