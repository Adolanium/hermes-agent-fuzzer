import { describe, expect, it } from 'vitest'

import { isJunkWidget, withNameNth } from '../src/driver/widgets.ts'

describe('withNameNth', () => {
  it('counts duplicates per role and name, not across the whole role list', () => {
    const numbered = withNameNth([
      { role: 'button', name: 'New session' },
      { role: 'button', name: 'Settings' },
      { role: 'button', name: 'New session' },
    ])
    expect(numbered[0]?.nth).toBe(0)
    expect(numbered[1]?.nth).toBe(0)
    expect(numbered[2]?.nth).toBe(1)
  })
})

describe('isJunkWidget', () => {
  it('drops unnamed chrome and version badges', () => {
    expect(isJunkWidget('button', 'button')).toBe(true)
    expect(isJunkWidget('v0.21.0 (+7) 05f548f', 'button')).toBe(true)
    expect(isJunkWidget('05f548f35dd3242', 'button')).toBe(true)
    expect(isJunkWidget('New session', 'button')).toBe(false)
    expect(isJunkWidget('composer', 'textbox')).toBe(false)
  })
})
