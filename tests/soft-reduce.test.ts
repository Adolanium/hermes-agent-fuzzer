import { describe, expect, it } from 'vitest'

import { cheapSoftMinimize } from '../src/reduce/soft.ts'
import type { RecordedAction } from '../src/types.ts'

describe('cheap soft minimize', () => {
  it('keeps chat steps for a no-reply finding', () => {
    const actions: RecordedAction[] = [
      { type: 'navigate', t: 1, seedStep: 1, hash: '/cron', window: 'main' },
      { type: 'navigate', t: 2, seedStep: 2, hash: '/', window: 'main' },
      {
        type: 'type',
        t: 3,
        seedStep: 3,
        locator: { strategy: 'css', css: '[data-slot="composer-rich-input"]', nth: 0, window: 'main' },
        value: '__mock_ok__',
      },
      { type: 'press', t: 4, seedStep: 4, key: 'Enter', window: 'main' },
      { type: 'resize', t: 5, seedStep: 5, width: 800, height: 600, window: 'main' },
    ]
    const kept = cheapSoftMinimize(
      { class: 'no-reply', severity: 'soft', message: 'Chat submitted 1 prompt(s) but the UI showed no assistant reply' },
      actions,
    )
    expect(kept).toHaveLength(3)
    expect(kept?.map((item) => item.type)).toEqual(['navigate', 'type', 'press'])
  })
})
