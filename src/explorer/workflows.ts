import { looksLikeOnboarding, snapshotAll } from '../driver/a11y.ts'
import { evalInPage } from '../driver/eval.ts'
import type { LaunchedApp } from '../driver/electron.ts'
import { performAction } from '../driver/perform.ts'
import type { RecordedAction, Widget } from '../types.ts'
import { PAGE_ACTIONS, type WorkflowName } from './surfaces.ts'

function clickNamed(widgets: Widget[], names: readonly string[]): RecordedAction | null {
  const lowered = names.map((name) => name.toLowerCase())
  const matches = widgets
    .filter((item) => lowered.some((name) => item.name.toLowerCase().includes(name)))
    .sort((a, b) => a.name.length - b.name.length)
  const widget = matches[0]
  if (!widget) {
    return null
  }
  return {
    type: 'click',
    t: Date.now(),
    seedStep: 0,
    locator: widget.locator,
    point: { x: widget.x, y: widget.y },
  }
}

async function run(launched: LaunchedApp, actions: RecordedAction[], action: RecordedAction, timeoutMs: number): Promise<boolean> {
  actions.push(action)
  const result = await performAction(launched, action, timeoutMs)
  return result.ok
}

export async function runSurfaceWorkflows(input: {
  launched: LaunchedApp
  actions: RecordedAction[]
  timeoutMs: number
  unsafeSurfaces: boolean
}): Promise<WorkflowName[]> {
  const done: WorkflowName[] = []
  const { launched, actions, timeoutMs } = input

  const paletteOpen: RecordedAction = {
    type: 'press',
    t: Date.now(),
    seedStep: actions.length,
    key: 'Control+K',
    window: 'main',
  }
  if (await run(launched, actions, paletteOpen, timeoutMs)) {
    await run(
      launched,
      actions,
      { type: 'wait', t: Date.now(), seedStep: actions.length, ms: 200 },
      timeoutMs,
    )
    await run(
      launched,
      actions,
      {
        type: 'type',
        t: Date.now(),
        seedStep: actions.length,
        locator: { strategy: 'css', css: 'input, [cmdk-input], [data-slot="command-input"]', nth: 0, window: 'main' },
        value: 'settings',
      },
      timeoutMs,
    )
    await run(
      launched,
      actions,
      { type: 'press', t: Date.now(), seedStep: actions.length, key: 'Escape', window: 'main' },
      timeoutMs,
    )
    done.push('palette')
  }

  const snaps = await snapshotAll(launched.pages, input.unsafeSurfaces)
  const widgets = snaps.flatMap((snap) => snap.widgets)
  const newSession = clickNamed(widgets, ['New session'])
  if (newSession) {
    newSession.seedStep = actions.length
    if (await run(launched, actions, newSession, timeoutMs)) {
      done.push('new-session')
    }
  }

  await run(
    launched,
    actions,
    { type: 'press', t: Date.now(), seedStep: actions.length, key: 'Control+N', window: 'main' },
    timeoutMs,
  )
  await run(
    launched,
    actions,
    { type: 'press', t: Date.now(), seedStep: actions.length, key: 'Escape', window: 'main' },
    timeoutMs,
  )
  done.push('shortcuts')

  for (const page of PAGE_ACTIONS) {
    await run(
      launched,
      actions,
      { type: 'navigate', t: Date.now(), seedStep: actions.length, hash: page.hash, window: 'main' },
      timeoutMs,
    )
    await run(
      launched,
      actions,
      { type: 'wait', t: Date.now(), seedStep: actions.length, ms: 150 },
      timeoutMs,
    )
    const pageSnaps = await snapshotAll(launched.pages, input.unsafeSurfaces)
    const click = clickNamed(pageSnaps.flatMap((snap) => snap.widgets), page.names)
    if (click) {
      click.seedStep = actions.length
      await run(launched, actions, click, timeoutMs)
      if (['/cron', '/profiles', '/agents', '/messaging', '/webhooks'].includes(page.hash)) {
        await run(
          launched,
          actions,
          {
            type: 'type',
            t: Date.now(),
            seedStep: actions.length,
            locator: { strategy: 'css', css: 'input, textarea, [contenteditable="true"]', nth: 0, window: 'main' },
            value: `fuzzer-${page.hash.slice(1)}`,
          },
          timeoutMs,
        )
      }
    }
  }
  if (await toggleAppearanceAndSave(launched, actions, timeoutMs)) {
    done.push('settings-save')
  }
  done.push('page-actions')

  await run(
    launched,
    actions,
    {
      type: 'resize',
      t: Date.now(),
      seedStep: actions.length,
      width: 1100,
      height: 720,
      window: 'main',
    },
    timeoutMs,
  )
  done.push('resize')

  await run(
    launched,
    actions,
    { type: 'navigate', t: Date.now(), seedStep: actions.length, hash: '/', window: 'main' },
    timeoutMs,
  )
  return done
}

async function pageText(launched: LaunchedApp): Promise<string> {
  return evalInPage<string>(
    launched.main,
    'return (document.body && document.body.innerText) || document.documentElement.innerText || ""',
  ).catch(() => '')
}

async function clickOnboardButton(launched: LaunchedApp, names: readonly string[]): Promise<string> {
  return evalInPage<string, string[]>(
    launched.main,
    `var want = arg;
     var buttons = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
     for (var i = 0; i < want.length; i++) {
       var name = want[i];
       var lower = name.toLowerCase();
       for (var b = 0; b < buttons.length; b++) {
         var text = ((buttons[b].innerText || buttons[b].getAttribute('aria-label') || '') + '').replace(/\\s+/g, ' ').trim();
         if (text.toLowerCase() === lower || text.toLowerCase().indexOf(lower) !== -1) {
           if (!buttons[b].disabled) {
             buttons[b].click();
             return text;
           }
         }
       }
     }
     return '';`,
    [...names],
  )
}

export async function runOnboardingWorkflow(input: {
  launched: LaunchedApp
  actions: RecordedAction[]
  timeoutMs: number
  unsafeSurfaces: boolean
}): Promise<{ workflows: WorkflowName[]; reached: boolean }> {
  const deadline = Date.now() + 15000
  let reached = looksLikeOnboarding(await pageText(input.launched))
  while (!reached && Date.now() < deadline) {
    await run(
      input.launched,
      input.actions,
      { type: 'wait', t: Date.now(), seedStep: input.actions.length, ms: 400 },
      input.timeoutMs,
    )
    reached = looksLikeOnboarding(await pageText(input.launched))
  }

  if (!reached) {
    const opener = await clickOnboardButton(input.launched, ['Add provider', 'Add a provider', 'Model', 'mock-model'])
    if (opener) {
      input.actions.push({
        type: 'click',
        t: Date.now(),
        seedStep: input.actions.length,
        locator: { strategy: 'role', role: 'button', name: opener, nth: 0, window: 'main' },
      })
      await run(
        input.launched,
        input.actions,
        { type: 'wait', t: Date.now(), seedStep: input.actions.length, ms: 600 },
        input.timeoutMs,
      )
      reached = looksLikeOnboarding(await pageText(input.launched))
    }
  }

  const names = [
    "I'll choose a provider later",
    'I have an API key',
    'Custom',
    'OpenAI',
    'Nous',
    'OpenRouter',
    'Skip',
    'Start chatting',
    'Continue without',
    'Continue',
  ]
  const clicked = await clickOnboardButton(input.launched, names)
  if (clicked) {
    input.actions.push({
      type: 'click',
      t: Date.now(),
      seedStep: input.actions.length,
      locator: { strategy: 'role', role: 'button', name: clicked, nth: 0, window: 'main' },
    })
    reached = true
    await run(
      input.launched,
      input.actions,
      { type: 'wait', t: Date.now(), seedStep: input.actions.length, ms: 300 },
      input.timeoutMs,
    )
  }

  await run(
    input.launched,
    input.actions,
    { type: 'navigate', t: Date.now(), seedStep: input.actions.length, hash: '/settings?tab=providers', window: 'main' },
    input.timeoutMs,
  )
  const snaps = await snapshotAll(input.launched.pages, input.unsafeSurfaces)
  const add = clickNamed(snaps.flatMap((snap) => snap.widgets), ['Add provider', 'Add', 'Connect'])
  if (add) {
    add.seedStep = input.actions.length
    await run(input.launched, input.actions, add, input.timeoutMs)
  }
  return { workflows: ['onboarding'], reached }
}

async function themeFingerprint(launched: LaunchedApp): Promise<string> {
  return evalInPage<string>(
    launched.main,
    `var root = document.documentElement;
     var scheme = '';
     try { scheme = localStorage.getItem('hermes-boot-color-scheme') || ''; } catch (e) {}
     var bg = '';
     try { bg = getComputedStyle(root).getPropertyValue('--dt-background').trim(); } catch (e) {}
     return [root.className, root.getAttribute('data-theme'), root.style.colorScheme, scheme, bg].join('|');`,
  )
}

async function clickAppearanceMode(launched: LaunchedApp, preferLight: boolean): Promise<string> {
  return evalInPage<string, boolean>(
    launched.main,
    `var want = arg ? ['Light', 'System', 'Dark'] : ['Dark', 'Light', 'System'];
     var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
     for (var i = 0; i < want.length; i++) {
       var name = want[i];
       var btn = null;
       for (var b = 0; b < buttons.length; b++) {
         var text = ((buttons[b].innerText || buttons[b].getAttribute('aria-label') || '') + '').replace(/\\s+/g, ' ').trim();
         if (text === name || text.toLowerCase() === name.toLowerCase()) {
           btn = buttons[b];
           break;
         }
       }
       if (btn && !btn.disabled) {
         btn.click();
         return name;
       }
     }
     return '';`,
    preferLight,
  )
}

export function themeChanged(before: string, after: string): boolean {
  return Boolean(before && after && before !== after)
}

export async function toggleAppearanceAndSave(
  launched: LaunchedApp,
  actions: RecordedAction[],
  timeoutMs: number,
): Promise<boolean> {
  await run(
    launched,
    actions,
    { type: 'navigate', t: Date.now(), seedStep: actions.length, hash: '/settings?tab=config:appearance', window: 'main' },
    timeoutMs,
  )
  await run(launched, actions, { type: 'wait', t: Date.now(), seedStep: actions.length, ms: 250 }, timeoutMs)
  const before = await themeFingerprint(launched).catch(() => '')
  const preferLight = before.toLowerCase().includes('dark')
  const clicked = await clickAppearanceMode(launched, preferLight)
  if (!clicked) {
    return false
  }
  actions.push({
    type: 'click',
    t: Date.now(),
    seedStep: actions.length,
    locator: { strategy: 'role', role: 'button', name: clicked, nth: 0, window: 'main' },
  })
  await run(launched, actions, { type: 'wait', t: Date.now(), seedStep: actions.length, ms: 250 }, timeoutMs)
  const after = await themeFingerprint(launched).catch(() => '')
  if (themeChanged(before, after)) {
    return true
  }
  const flipped = await clickAppearanceMode(launched, !preferLight)
  if (!flipped) {
    return false
  }
  actions.push({
    type: 'click',
    t: Date.now(),
    seedStep: actions.length,
    locator: { strategy: 'role', role: 'button', name: flipped, nth: 0, window: 'main' },
  })
  await run(launched, actions, { type: 'wait', t: Date.now(), seedStep: actions.length, ms: 250 }, timeoutMs)
  const again = await themeFingerprint(launched).catch(() => '')
  return themeChanged(before, again)
}
