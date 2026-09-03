import { describe, expect, it } from 'vitest'

import { mutateSequence } from '../src/explorer/mutate.ts'
import { SeededRng } from '../src/rng.ts'
import type { RecordedAction } from '../src/types.ts'

describe('corpus mutation', () => {
  it('returns a sequence derived from the original', () => {
    const actions: RecordedAction[] = [
      { type: 'wait', t: 1, seedStep: 1, ms: 10 },
      { type: 'press', t: 2, seedStep: 2, key: 'Escape', window: 'main' },
      {
        type: 'type',
        t: 3,
        seedStep: 3,
        locator: { strategy: 'css', css: 'textarea', nth: 0, window: 'main' },
        value: 'hi',
      },
    ]
    const mutated = mutateSequence(actions, new SeededRng(7))
    expect(mutated.length).toBeGreaterThan(0)
    expect(mutated.every((a) => typeof a.type === 'string')).toBe(true)
  })
})
