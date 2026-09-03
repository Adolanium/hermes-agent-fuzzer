import { describe, expect, it } from 'vitest'

import { classifyView } from '../src/driver/a11y.ts'

describe('classifyView', () => {
  it('maps hash routes and extra windows', () => {
    expect(classifyView('/settings', { dialog: false, palette: false, window: 'main' })).toBe('settings')
    expect(classifyView('/', { dialog: false, palette: true, window: 'main' })).toBe('palette')
    expect(classifyView('/', { dialog: true, palette: false, window: 'main' })).toBe('dialog')
    expect(classifyView('/', { dialog: false, palette: false, window: 'hud' })).toBe('hud')
    expect(classifyView('/kanban', { dialog: false, palette: false, window: 'main' })).toBe('extension')
    expect(classifyView('/settings?tab=about', { dialog: false, palette: false, window: 'main' })).toBe('settings')
    expect(classifyView('/skills?tab=mcp', { dialog: false, palette: false, window: 'main' })).toBe('skills')
  })
})
