import { actionLabel } from '../record/actions.ts'
import type { ConfigMutant } from '../explorer/surfaces.ts'
import type { Failure, LaunchProfile, RecordedAction, TargetInfo } from '../types.ts'

export function writeReproMarkdown(input: {
  target: TargetInfo
  profile: LaunchProfile
  mutant?: ConfigMutant
  seed: number
  actions: RecordedAction[]
  failure: Failure
  fuzzerVersion: string
}): string {
  const steps = input.actions.map((action, index) => `${index + 1}. ${actionLabel(action)}`).join('\n')
  return `# Reproduction

- Desktop SHA: \`${input.target.sha}\`
- Remote: ${input.target.remote} (${input.target.branch})
- Profile: ${input.profile}
- Config mutant: ${input.mutant ?? 'sane'}
- Seed: ${input.seed}
- Fuzzer: ${input.fuzzerVersion}
- Failure: ${input.failure.class} (${input.failure.severity})
- Message: ${input.failure.message}

## Steps

Launch Hermes Agent Desktop with an isolated \`HERMES_HOME\` and the ${input.profile} profile.

${steps || '1. Launch the app and wait. The failure happened during boot.'}

## Expected

The app stays up. No crash, hang, error boundary, or uncaught exception.

## Actual

${input.failure.message}
`
}
