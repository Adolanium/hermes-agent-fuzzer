import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import { actionLabel, isRecordedAction, readActions, writeActions } from '../src/record/actions.ts'
import type { RecordedAction } from '../src/types.ts'

const sample: RecordedAction = {
  type: 'click',
  t: 1,
  seedStep: 1,
  locator: { strategy: 'role', role: 'button', name: 'New session', nth: 0, window: 'main' },
}

describe('recorded actions', () => {
  it('round-trips through disk', () => {
    const file = path.join(os.tmpdir(), `fuzz-actions-${Date.now()}.json`)
    writeActions(file, [sample])
    expect(readActions(file)).toEqual([sample])
    fs.rmSync(file)
  })

  it('rejects junk', () => {
    expect(isRecordedAction({ type: 'explode' })).toBe(false)
    expect(isRecordedAction(sample)).toBe(true)
  })

  it('prints a human step', () => {
    expect(actionLabel(sample)).toContain('New session')
  })
})
