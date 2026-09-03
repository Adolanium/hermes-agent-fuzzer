import { ACTIONABLE_ROLES } from '../types.ts'

export type RawWidget = {
  role: string
  name: string
  editable: boolean
  x: number
  y: number
  testid: string
}

export function isJunkWidget(name: string, role: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === role) {
    return true
  }
  if (trimmed.length > 60) {
    return true
  }
  if (/^v?\d+\.\d+\.\d+/.test(trimmed)) {
    return true
  }
  if (/^[0-9a-f]{7,40}$/i.test(trimmed)) {
    return true
  }
  return false
}

export function nameKey(role: string, name: string): string {
  return `${role}:${name}`
}

export function withNameNth<T extends { role: string; name: string }>(items: T[]): Array<T & { nth: number }> {
  const counts = new Map<string, number>()
  return items.map((item) => {
    const key = nameKey(item.role, item.name)
    const nth = counts.get(key) ?? 0
    counts.set(key, nth + 1)
    return { ...item, nth }
  })
}

export const ROLE_SELECTORS: Record<(typeof ACTIONABLE_ROLES)[number], string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"]',
  link: 'a[href], [role="link"]',
  textbox: 'textarea, [role="textbox"], input:not([type]), input[type="text"], input[type="email"], input[type="url"], input[type="password"], input[type="number"]',
  searchbox: 'input[type="search"], [role="searchbox"]',
  combobox: 'select, [role="combobox"]',
  tab: '[role="tab"]',
  menuitem: '[role="menuitem"]',
  switch: '[role="switch"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  slider: 'input[type="range"], [role="slider"]',
  treeitem: '[role="treeitem"]',
  option: '[role="option"], option',
  spinbutton: '[role="spinbutton"]',
}

export const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton'])
