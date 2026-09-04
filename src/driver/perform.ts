import type { Locator, Page } from 'playwright'

import { insertComposerText } from './chat.ts'
import { evalInPage } from './eval.ts'
import type { LaunchedApp } from './electron.ts'
import { pageFor } from './electron.ts'
import type { ActionLocator, RecordedAction, WindowKind } from '../types.ts'

export type PerformResult = {
  ok: boolean
  error?: string
  elapsedMs: number
}

function locatorFor(page: Page, locator: ActionLocator): Locator | null {
  switch (locator.strategy) {
    case 'role':
      return page
        .getByRole(locator.role as Parameters<Page['getByRole']>[0], {
          name: locator.name,
          exact: locator.name.length > 1,
        })
        .nth(locator.nth)
    case 'aria':
      return page.getByLabel(locator.name, { exact: true }).nth(locator.nth)
    case 'testid':
      return page.getByTestId(locator.testid).nth(locator.nth)
    case 'css':
      return page.locator(locator.css).nth(locator.nth)
    case 'xy':
      return null
  }
}

function pointOf(action: RecordedAction): { x: number; y: number } | null {
  if (action.type === 'click' || action.type === 'type' || action.type === 'contextmenu') {
    if (action.point) {
      return action.point
    }
    if (action.locator.strategy === 'xy') {
      return { x: action.locator.x, y: action.locator.y }
    }
  }
  return null
}

async function clickAt(page: Page, x: number, y: number, button: 'left' | 'right'): Promise<void> {
  await page.mouse.click(x, y, { button })
}

async function clickWithFallback(
  page: Page,
  action: Extract<RecordedAction, { locator: ActionLocator }>,
  timeoutMs: number,
  button: 'left' | 'right',
): Promise<void> {
  if (action.locator.strategy === 'xy') {
    await clickAt(page, action.locator.x, action.locator.y, button)
    return
  }
  const loc = locatorFor(page, action.locator)
  if (loc) {
    try {
      await clickLocator(loc, timeoutMs, button)
      return
    } catch {
      // role/name often disagrees with the accessible name. Hit the snapshot point.
    }
  }
  const point = pointOf(action)
  if (point) {
    await clickAt(page, point.x, point.y, button)
    return
  }
  throw new Error('click missed')
}

function windowOf(action: RecordedAction): WindowKind {
  if (action.type === 'click' || action.type === 'type' || action.type === 'contextmenu') {
    return action.locator.window
  }
  if (action.type === 'wait') {
    return 'main'
  }
  return action.window
}

async function clickLocator(loc: Locator, timeoutMs: number, button: 'left' | 'right'): Promise<void> {
  try {
    await loc.click({ timeout: timeoutMs, button })
  } catch {
    await loc.click({ timeout: Math.min(250, timeoutMs), button, force: true })
  }
}

export async function performAction(launched: LaunchedApp, action: RecordedAction, timeoutMs: number, record = true): Promise<PerformResult> {
  const result = await performActionRaw(launched, action, timeoutMs)
  if (record) action.outcome = { ok: result.ok }
  return result
}

async function performActionRaw(launched: LaunchedApp, action: RecordedAction, timeoutMs: number): Promise<PerformResult> {
  const started = Date.now()
  const page = pageFor(launched, windowOf(action))
  if (page.isClosed()) {
    return { ok: false, error: 'window closed', elapsedMs: Date.now() - started }
  }

  try {
    switch (action.type) {
      case 'click':
        await clickWithFallback(page, action, timeoutMs, 'left')
        break
      case 'type': {
        const value = action.value.slice(0, 4000)
        const composer =
          action.locator.strategy === 'css' && action.locator.css.includes('composer-rich-input')
        if (composer) {
          const inserted = await insertComposerText(page, value)
          if (!inserted) {
            await clickWithFallback(page, action, timeoutMs, 'left')
            await page.keyboard.type(value.slice(0, 240), { delay: 0 })
          }
          break
        }
        await clickWithFallback(page, action, timeoutMs, 'left')
        const loc = locatorFor(page, action.locator)
        if (loc) {
          const filled = await loc.fill(value).then(() => true).catch(() => false)
          if (!filled) {
            await page.keyboard.type(value.slice(0, 240), { delay: 0 })
          }
        } else {
          await page.keyboard.type(value.slice(0, 240), { delay: 0 })
        }
        break
      }
      case 'press':
        await page.keyboard.press(action.key)
        break
      case 'navigate':
        await evalInPage(page, 'window.location.hash = arg', action.hash)
        break
      case 'resize': {
        const resize = new Function(
          'mods',
          'size',
          'var win = mods.BrowserWindow.getFocusedWindow() || mods.BrowserWindow.getAllWindows()[0]; if (win) win.setSize(size.width, size.height);',
        )
        await launched.app.evaluate(resize as never, { width: action.width, height: action.height })
        break
      }
      case 'contextmenu':
        await clickWithFallback(page, action, timeoutMs, 'right')
        break
      case 'wait':
        await new Promise((resolve) => setTimeout(resolve, action.ms))
        break
    }
    return { ok: true, elapsedMs: Date.now() - started }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message, elapsedMs: Date.now() - started }
  }
}

export async function evaluateWithHangBudget(page: Page, hangMs: number): Promise<string> {
  return Promise.race([
    evalInPage<string>(page, 'return (document.body && document.body.innerText) || ""'),
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error(`hang: evaluate exceeded ${hangMs}ms`)), hangMs)
    }),
  ])
}
