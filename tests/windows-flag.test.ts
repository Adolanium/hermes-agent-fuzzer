import { describe, expect, it } from 'vitest'

import { parseWindowsFlag } from '../src/campaign/run.ts'

describe('parseWindowsFlag', () => {
  it('opens HUD and Quick Entry when asked', () => {
    expect(parseWindowsFlag('main')).toEqual([])
    expect(parseWindowsFlag(undefined)).toEqual([])
    expect(parseWindowsFlag('hud,quick')).toEqual(['hud', 'quick'])
    expect(parseWindowsFlag('all')).toEqual(['hud', 'quick', 'overlay', 'wake'])
    expect(parseWindowsFlag('wake')).toEqual(['wake'])
  })
})
