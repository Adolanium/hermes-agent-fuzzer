import { describe, expect, it } from 'vitest'

import { classifyWindowUrl } from '../src/driver/electron.ts'
import {
  bootTimeoutFailure,
  classifyFaults,
  noReplyFailure,
  parseLogFaults,
  persistableFailures,
  uniqueFailures,
} from '../src/oracle/detect.ts'
import type { FailureClass, UiSnapshot } from '../src/types.ts'
import { isDesktopFaultLine, isInterestingAlert, isInterestingBodyFault, isInterestingConsoleError } from '../src/oracle/signals.ts'

describe('console and alert filters', () => {
  it('drops fuzzer and browser noise', () => {
    expect(isInterestingConsoleError('ReferenceError: __name is not defined')).toBe(false)
    expect(isInterestingConsoleError('Download the React DevTools for a better development experience')).toBe(
      false,
    )
    expect(isInterestingConsoleError('TypeError: Cannot read properties of undefined')).toBe(true)
    expect(isInterestingConsoleError('gateway dial failed')).toBe(true)
  })

  it('drops boring toasts and info banners', () => {
    expect(isInterestingAlert('Copied to clipboard')).toBe(false)
    expect(isInterestingAlert('Theme updated')).toBe(false)
    expect(isInterestingAlert('Webhook receiver disabled. Enable them here.')).toBe(false)
    expect(isInterestingAlert('Gateway connection lost')).toBe(true)
    expect(isInterestingAlert('Failed to load settings')).toBe(true)
  })

  it('flags chat and gateway faults in page text', () => {
    expect(isInterestingBodyFault('Failed to send message to the provider')).toBe(true)
    expect(isInterestingBodyFault('New session\nSettings\nHello from the fuzzer mock')).toBe(false)
  })
})

describe('desktop.log faults', () => {
  it('flags renderer and uncaught lines only', () => {
    expect(isDesktopFaultLine('[main] trusting extra TLS')).toBe(false)
    expect(isDesktopFaultLine('[main] Uncaught exception: boom')).toBe(true)
    expect(isDesktopFaultLine('[renderer] TypeError: x is not a function')).toBe(true)
    const faults = parseLogFaults(
      [
        '[main] ready',
        '[main] Uncaught exception: boom',
        '[renderer] failed to mount settings',
      ].join('\n'),
    )
    expect(faults).toHaveLength(2)
    expect(faults[0]?.severity).toBe('hard')
    expect(faults[1]?.severity).toBe('soft')
  })
})

describe('failure persistence', () => {
  it('keeps the first fault when later sources repeat it', () => {
    const message = 'TypeError: Cannot read properties of undefined'
    expect(classifyFaults({
      closed: false,
      mainGone: false,
      pageErrors: [message, message],
      consoleErrors: [message],
      desktopLog: '',
      alerts: ['Gateway connection lost', 'Gateway connection lost', 'Failed to load settings'],
      route: '/',
    })).toEqual([
      { class: 'pageerror', severity: 'hard', message, stack: message, route: '/' },
      { class: 'alert', severity: 'soft', message: 'Gateway connection lost', alertText: 'Gateway connection lost', route: '/' },
      { class: 'alert', severity: 'soft', message: 'Failed to load settings', alertText: 'Failed to load settings', route: '/' },
    ])
  })

  it('drops perf and duplicates', () => {
    const kept = persistableFailures([
      { class: 'perf', severity: 'soft', message: 'Action took 900ms' },
      { class: 'alert', severity: 'soft', message: 'Gateway connection lost' },
      { class: 'alert', severity: 'soft', message: 'Gateway connection lost' },
    ])
    expect(kept).toEqual([{ class: 'alert', severity: 'soft', message: 'Gateway connection lost' }])
    expect(uniqueFailures(kept)).toHaveLength(1)
  })
})

describe('window classification', () => {
  it('does not let a peer pop-out steal main', () => {
    expect(classifyWindowUrl('file:///app/index.html?win=hud', false)).toBe('hud')
    expect(classifyWindowUrl('file:///app/index.html?peer=1', true)).toBe('unknown')
    expect(classifyWindowUrl('file:///app/index.html?peer=1', false)).toBe('unknown')
    expect(classifyWindowUrl('file:///app/index.html', false)).toBe('main')
    expect(classifyWindowUrl('file:///app/index.html', true)).toBe('unknown')
    expect(classifyWindowUrl('file:///app/index.html?win=wake#/', true)).toBe('wake')
  })
})

function snap(extras: Partial<UiSnapshot> = {}): UiSnapshot {
  return {
    window: 'main',
    url: 'hermes://app#/',
    title: 'Hermes',
    route: '/',
    view: 'chat',
    dialogTitle: null,
    bootPhase: 'ready',
    bodyPreview: 'New session',
    widgets: [{ locator: { strategy: 'role', role: 'button', name: 'New session', nth: 0, window: 'main' }, role: 'button', name: 'New session', editable: false, x: 1, y: 1 }],
    roleNames: ['button:New session'],
    ...extras,
  }
}

describe('required oracles persist', () => {
  it('emits every required class from fixtures and keeps them', () => {
    const found = new Set<FailureClass>()
    const add = (failures: ReturnType<typeof classifyFaults>) => {
      for (const failure of persistableFailures(failures)) {
        found.add(failure.class)
      }
    }
    add(classifyFaults({ closed: true, mainGone: true, pageErrors: [], consoleErrors: [], desktopLog: '' }))
    add(
      classifyFaults({
        closed: false,
        mainGone: false,
        pageErrors: ['TypeError: boom'],
        consoleErrors: ['gateway dial failed'],
        desktopLog: '[main] Uncaught exception: boom\n[renderer] failed to mount',
        main: snap({ title: 'Something broke in the interface', bootPhase: 'error' }),
        body: 'Something broke in the interface',
        alerts: ['Gateway connection lost'],
        hangMessage: 'hang: evaluate exceeded 20000ms',
      }),
    )
    add(
      classifyFaults({
        closed: false,
        mainGone: true,
        pageErrors: ['render-process-gone'],
        consoleErrors: [],
        desktopLog: '',
        main: snap({ widgets: [], roleNames: [] }),
      }),
    )
    add(
      classifyFaults({
        closed: false,
        mainGone: false,
        pageErrors: [],
        consoleErrors: [],
        desktopLog: '',
        main: snap({ widgets: [], roleNames: [], bootPhase: 'ready' }),
      }),
    )
    found.add(noReplyFailure(1, '/').class)
    found.add(bootTimeoutFailure('/').class)
    const required: FailureClass[] = [
      'process-exit', 'pageerror', 'crash', 'hang', 'error-boundary',
      'uncaught-main', 'alert', 'frozen-ui', 'boot-timeout', 'no-reply',
    ]
    for (const cls of required) {
      expect(found.has(cls)).toBe(true)
    }
  })
})
