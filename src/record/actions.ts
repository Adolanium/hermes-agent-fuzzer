import * as fs from 'node:fs'

import type { ActionLocator, RecordedAction } from '../types.ts'

export function writeActions(file: string, actions: RecordedAction[]): void {
  fs.writeFileSync(file, JSON.stringify(actions, null, 2), 'utf8')
}

export function readActions(file: string): RecordedAction[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid actions file: ${file}`)
  }
  const actions: RecordedAction[] = []
  for (const [index, item] of parsed.entries()) {
    if (!isRecordedAction(item)) throw new Error(`Invalid action at step ${index + 1}: ${file}`)
    actions.push(item)
  }
  return actions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isRecordedAction(value: unknown): value is RecordedAction {
  if (!isRecord(value) || typeof value.type !== 'string' || !finite(value.t) || !integer(value.seedStep)) {
    return false
  }
  if (value.outcome !== undefined && (!isRecord(value.outcome) || typeof value.outcome.ok !== 'boolean')) return false
  if (value.point !== undefined && (!isRecord(value.point) || !finite(value.point.x) || !finite(value.point.y))) return false
  switch (value.type) {
    case 'click':
    case 'contextmenu':
      return isLocator(value.locator)
    case 'type':
      return isLocator(value.locator) && typeof value.value === 'string'
    case 'press':
      return typeof value.key === 'string' && isWindowKind(value.window)
    case 'navigate':
      return typeof value.hash === 'string' && isWindowKind(value.window)
    case 'resize':
      return integer(value.width) && value.width > 0 && integer(value.height) && value.height > 0 && isWindowKind(value.window)
    case 'wait':
      return finite(value.ms) && value.ms >= 0
    default:
      return false
  }
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function integer(value: unknown): value is number { return finite(value) && Number.isInteger(value) && value >= 0 }

export function isWindowKind(value: unknown): value is import('../types.ts').WindowKind {
  return typeof value === 'string' && ['main', 'hud', 'quick', 'overlay', 'wake', 'unknown'].includes(value)
}

function isLocator(value: unknown): value is ActionLocator {
  if (!isRecord(value) || !isWindowKind(value.window)) {
    return false
  }
  if (value.strategy === 'xy') return finite(value.x) && finite(value.y)
  if (!integer(value.nth)) return false
  switch (value.strategy) {
    case 'role': return typeof value.role === 'string' && typeof value.name === 'string'
    case 'aria': return typeof value.name === 'string'
    case 'testid': return typeof value.testid === 'string'
    case 'css': return typeof value.css === 'string'
    default: return false
  }
}

export function actionLabel(action: RecordedAction): string {
  switch (action.type) {
    case 'click':
      return `Click ${locatorLabel(action.locator)}`
    case 'type':
      return `Type ${JSON.stringify(action.value.slice(0, 80))} into ${locatorLabel(action.locator)}`
    case 'press':
      return `Press ${action.key}`
    case 'navigate':
      return `Go to #${action.hash}`
    case 'resize':
      return `Resize window to ${action.width}x${action.height}`
    case 'contextmenu':
      return `Right-click ${locatorLabel(action.locator)}`
    case 'wait':
      return `Wait ${action.ms}ms`
  }
}

function locatorLabel(locator: ActionLocator): string {
  switch (locator.strategy) {
    case 'role':
      return `${locator.role} "${locator.name}"`
    case 'aria':
      return `labeled "${locator.name}"`
    case 'testid':
      return `testid ${locator.testid}`
    case 'css':
      return locator.css
    case 'xy':
      return `(${locator.x}, ${locator.y})`
  }
}
