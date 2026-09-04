import { describe, expect, it } from 'vitest'

import { mutateSequence } from '../src/explorer/mutate.ts'
import { SeededRng } from '../src/rng.ts'
import { isRecordedAction } from '../src/record/actions.ts'
import type { RecordedAction } from '../src/types.ts'

describe('corpus mutation', () => {
  it('produces valid, repeatable mutations without changing the source sequence', () => {
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
    const original = structuredClone(actions)
    let changed = false
    for (let seed = 0; seed < 32; seed += 1) {
      const mutated = mutateSequence(actions, new SeededRng(seed))
      expect(mutated.length).toBeGreaterThan(0)
      expect(mutated.every(isRecordedAction)).toBe(true)
      expect(mutated).toEqual(mutateSequence(actions, new SeededRng(seed)))
      expect(actions).toEqual(original)
      changed ||= JSON.stringify(mutated) !== JSON.stringify(original)
    }
    expect(changed).toBe(true)
  })
})
