import { fingerprintOf } from '../findings/fingerprint.ts'
import type { Failure, RecordedAction, WindowKind } from '../types.ts'

export type ReplayStatus = 'matched' | 'different-failure' | 'not-reproduced' | 'diverged' | 'runner-error'
export type ReplayResult = {
  status: ReplayStatus
  reproduced: Failure[]
  step: number
  message?: string
}

export function matchesFailure(expected: Failure, actual: Failure): boolean {
  return expected.severity === actual.severity && fingerprintOf(expected) === fingerprintOf(actual)
}

export function replayResult(expected: Failure, failures: Failure[], step: number): ReplayResult {
  return {
    status: failures.some((failure) => matchesFailure(expected, failure))
      ? 'matched' : failures.length > 0 ? 'different-failure' : 'not-reproduced',
    reproduced: failures,
    step,
  }
}

export function actionWindow(action: RecordedAction): WindowKind {
  if (action.type === 'wait') return 'main'
  return 'locator' in action ? action.locator.window : action.window
}

// The driver is injected so fault identity and divergence can be tested without Electron.
export async function executeReplay(input: {
  expected: Failure
  actions: RecordedAction[]
  perform: (action: RecordedAction) => Promise<{ ok: boolean; error?: string }>
  observe: () => Promise<Failure[]>
}): Promise<ReplayResult> {
  const seen: Failure[] = []
  for (let step = 0; step <= input.actions.length; step += 1) {
    const action = input.actions[step - 1]
    const performed = action ? await input.perform(action) : undefined
    seen.push(...await input.observe())
    const result = replayResult(input.expected, seen, step)
    if (result.status === 'matched' || seen.some((failure) => failure.severity === 'hard')) return result
    if (performed && performed.ok !== (action?.outcome?.ok ?? true)) {
      return { ...result, status: 'diverged', message: performed.error ?? 'Action failed' }
    }
  }
  return replayResult(input.expected, seen, input.actions.length)
}
