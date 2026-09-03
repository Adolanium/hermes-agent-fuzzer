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
  for (const item of parsed) {
    if (isRecordedAction(item)) {
      actions.push(item)
    }
  }
  return actions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isRecordedAction(value: unknown): value is RecordedAction {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.t !== 'number' || typeof value.seedStep !== 'number') {
    return false
  }
  switch (value.type) {
    case 'click':
    case 'contextmenu':
      return isLocator(value.locator)
    case 'type':
      return isLocator(value.locator) && typeof value.value === 'string'
    case 'press':
      return typeof value.key === 'string'
    case 'navigate':
      return typeof value.hash === 'string'
    case 'resize':
      return typeof value.width === 'number' && typeof value.height === 'number'
    case 'wait':
      return typeof value.ms === 'number'
    default:
      return false
  }
}

function isLocator(value: unknown): value is ActionLocator {
  if (!isRecord(value) || typeof value.strategy !== 'string' || typeof value.window !== 'string') {
    return false
  }
  return true
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
