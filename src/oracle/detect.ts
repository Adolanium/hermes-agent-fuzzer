import * as fs from 'node:fs'
import * as path from 'node:path'

import type { LaunchedApp } from '../driver/electron.ts'
import { evaluateWithHangBudget } from '../driver/perform.ts'
import { routeFromUrl } from '../driver/a11y.ts'
import type { Failure, FailureClass, UiSnapshot } from '../types.ts'
import { isDesktopFaultLine, isInterestingAlert, isInterestingBodyFault, isInterestingConsoleError } from './signals.ts'

const ERROR_BOUNDARY_RE = /something broke in the interface|no queryclient set|something went wrong/i

export type OracleState = {
  failures: Failure[]
  lastAlert: string | null
  lastShotB64: string | null
  hang: boolean
}

export function emptyOracle(): OracleState {
  return { failures: [], lastAlert: null, lastShotB64: null, hang: false }
}

function add(state: OracleState, failure: Failure): void {
  const dup = state.failures.some((f) => f.class === failure.class && f.message === failure.message)
  if (!dup) {
    state.failures.push(failure)
  }
}

export function hardFailure(state: OracleState): Failure | undefined {
  return state.failures.find((f) => f.severity === 'hard')
}

export function readDesktopLog(hermesHome: string): string {
  const file = path.join(hermesHome, 'logs', 'desktop.log')
  if (!fs.existsSync(file)) {
    return ''
  }
  return fs.readFileSync(file, 'utf8')
}

export function readAgentLog(hermesHome: string): string {
  const file = path.join(hermesHome, 'logs', 'agent.log')
  if (!fs.existsSync(file)) {
    return ''
  }
  return fs.readFileSync(file, 'utf8')
}

export function uniqueFailures(failures: Failure[]): Failure[] {
  const seen = new Set<string>()
  const out: Failure[] = []
  for (const failure of failures) {
    const key = `${failure.class}\0${failure.message}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(failure)
  }
  return out
}

export function persistableFailures(failures: Failure[]): Failure[] {
  return uniqueFailures(failures.filter((failure) => failure.class !== 'perf'))
}

export function parseLogFaults(logText: string): Failure[] {
  const failures: Failure[] = []
  for (const line of logText.split(/\r?\n/)) {
    if (!isDesktopFaultLine(line)) {
      continue
    }
    const hard = /Uncaught exception|Unhandled rejection|render-process-gone|crashed/i.test(line)
    failures.push({
      class: hard ? 'uncaught-main' : 'pageerror',
      severity: hard ? 'hard' : 'soft',
      message: line.trim().slice(0, 500),
      stack: line,
    })
  }
  return failures
}

export function classifyFaults(input: {
  closed: boolean
  mainGone: boolean
  pageErrors: string[]
  consoleErrors: string[]
  desktopLog: string
  main?: UiSnapshot
  body?: string
  alerts?: string[]
  previousShotB64?: string | null
  currentShotB64?: string | null
  hangMessage?: string
  route?: string
}): Failure[] {
  const state = emptyOracle()
  const route = input.route ?? input.main?.route

  if (input.closed) {
    add(state, { class: 'process-exit', severity: 'hard', message: 'Electron closed unexpectedly', route })
  }

  for (const err of input.pageErrors) {
    if (err.includes('__name is not defined')) {
      continue
    }
    const crashed = /crash|render-process-gone/i.test(err)
    add(state, {
      class: crashed ? 'crash' : 'pageerror',
      severity: 'hard',
      message: err.slice(0, 400),
      stack: err,
      route,
    })
  }

  for (const fault of parseLogFaults(input.desktopLog)) {
    add(state, { ...fault, route })
  }

  for (const err of input.consoleErrors) {
    if (!isInterestingConsoleError(err)) {
      continue
    }
    add(state, {
      class: 'pageerror',
      severity: 'soft',
      message: err.slice(0, 400),
      stack: err,
      route,
    })
  }

  if (input.main?.bootPhase === 'error' || (input.main && ERROR_BOUNDARY_RE.test(input.main.title))) {
    add(state, { class: 'error-boundary', severity: 'hard', message: 'Renderer error boundary', route })
  }

  if (input.hangMessage?.startsWith('hang:')) {
    add(state, { class: 'hang', severity: 'hard', message: input.hangMessage, route })
  }

  if (input.body) {
    if (ERROR_BOUNDARY_RE.test(input.body)) {
      add(state, { class: 'error-boundary', severity: 'hard', message: input.body.slice(0, 300), route })
    } else if (isInterestingBodyFault(input.body)) {
      add(state, { class: 'alert', severity: 'soft', message: input.body.replace(/\s+/g, ' ').trim().slice(0, 300), route })
    }
  }

  for (const text of input.alerts ?? []) {
    if (!isInterestingAlert(text)) {
      continue
    }
    add(state, { class: 'alert', severity: 'soft', message: text, alertText: text, route })
  }

  if (input.previousShotB64 && input.currentShotB64 && input.previousShotB64 === input.currentShotB64 && input.main?.widgets.length === 0) {
    add(state, { class: 'frozen-ui', severity: 'soft', message: 'Identical screenshot and no widgets', route })
  } else if (input.main && input.main.widgets.length === 0 && input.main.bootPhase === 'ready' && !input.currentShotB64) {
    add(state, { class: 'frozen-ui', severity: 'soft', message: 'Ready UI with no actionable widgets', route })
  }

  if (input.mainGone && !input.closed) {
    add(state, { class: 'crash', severity: 'hard', message: 'Main window vanished while process alive', route })
  }

  return persistableFailures(state.failures)
}

export async function pollOracles(input: {
  launched: LaunchedApp
  hermesHome: string
  snapshots: UiSnapshot[]
  hangMs: number
  previousShotB64: string | null
  takeScreenshot?: boolean
}): Promise<OracleState> {
  const state = emptyOracle()
  const main = input.snapshots.find((s) => s.window === 'main') ?? input.snapshots[0]
  let body: string | undefined
  let alerts: string[] | undefined
  let currentShotB64: string | null | undefined
  let hangMessage: string | undefined
  const mainGone = input.launched.main.isClosed()

  try {
    const page = input.launched.main
    if (!page.isClosed()) {
      body = await evaluateWithHangBudget(page, input.hangMs)
      alerts = (await page.locator('[role="alert"]').allTextContents()).map((t) => t.trim()).filter(Boolean)
      if (input.takeScreenshot) {
        const shot = await page.screenshot({ type: 'png' }).catch(() => null)
        if (shot) {
          currentShotB64 = shot.toString('base64')
          state.lastShotB64 = currentShotB64
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith('hang:')) {
      hangMessage = message
      state.hang = true
    }
  }

  const failures = classifyFaults({
    closed: input.launched.closed,
    mainGone,
    pageErrors: input.launched.pageErrors,
    consoleErrors: input.launched.consoleErrors,
    desktopLog: readDesktopLog(input.hermesHome),
    main,
    body,
    alerts,
    previousShotB64: input.previousShotB64,
    currentShotB64: input.takeScreenshot ? currentShotB64 : undefined,
    hangMessage,
    route: routeFromUrl(input.launched.main.url()),
  })
  for (const failure of failures) {
    add(state, failure)
    if (failure.alertText) {
      state.lastAlert = failure.alertText
    }
  }
  return state
}

export function bootTimeoutFailure(route?: string): Failure {
  return { class: 'boot-timeout', severity: 'hard', message: 'App never reached a ready UI', route }
}

export function noReplyFailure(prompts: number, route?: string): Failure {
  return {
    class: 'no-reply',
    severity: 'soft',
    message: `Chat submitted ${prompts} prompt(s) but the UI showed no assistant reply`,
    route,
  }
}

export function looksLikeAssistantReply(body: string): boolean {
  return /hello from the fuzzer mock|long mock|partial mock|مرحبا|script>alert|bold|paragraph /i.test(body)
}

export function perfFailure(elapsedMs: number, route?: string): Failure {
  return {
    class: 'perf',
    severity: 'soft',
    message: `Action took ${elapsedMs}ms`,
    route,
  }
}

export function isHardClass(value: FailureClass): boolean {
  return (
    value === 'process-exit' ||
    value === 'pageerror' ||
    value === 'crash' ||
    value === 'hang' ||
    value === 'error-boundary' ||
    value === 'uncaught-main' ||
    value === 'boot-timeout'
  )
}
