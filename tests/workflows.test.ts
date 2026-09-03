import { describe, expect, it } from 'vitest'

import { themeChanged } from '../src/explorer/workflows.ts'

describe('appearance save', () => {
  it('counts a theme fingerprint change as a save', () => {
    expect(themeChanged('dark|hermes|dark|dark', 'light|hermes|light|light')).toBe(true)
    expect(themeChanged('dark|hermes|dark|dark', 'dark|hermes|dark|dark')).toBe(false)
    expect(themeChanged('', 'dark|hermes|dark|dark')).toBe(false)
  })
})
