# Version 0.1.0: trustworthy reproductions

## Scope

1. Share failure identity and replay execution between replay and reduction. Detect a different failure, missing window, failed action, and setup error separately. Poll after each step.
2. Validate artifacts, prepare their recorded commit by default, and restore windows, onboarding mode, and replay budgets. Preserve explicit drift as an override.
3. Record occurrences and replay attempts separately from finding status. Keep verified reproductions ahead of unverified candidates. Show evidence in the inbox.
4. Write campaign summaries and use exit codes 0 for no hard findings, 1 for runner/setup errors, and 2 for hard findings. Prepare the target in smoke CI and always upload results.

## Validation

Run unit tests and TypeScript checks. Add regression tests for unrelated failures, replay divergence, pinned Git checkout, artifact validation, finding history, and campaign outcomes. Exercise injected faults through the replay/reduction path with a controlled driver. Live Hermes validation requires a target build and an interactive desktop; report separately whether it was run.

## Deferred

Regression corpus management, additional fuzzing surfaces, parallel workers, and a graphical inbox.

## Completed validation

- All four implementation steps are complete in version 0.1.0.
- 85 tests passed across 29 files, including the opt-in Electron integration test using Electron 40.0.0.
- The hidden Electron fixture reproduced a renderer crash, reduced it to one keypress, rejected a different fault, and reported a missing window as divergence.
- TypeScript and Git whitespace checks passed.
- A CLI run with a deliberately missing target returned exit code 1 and wrote a runner-error campaign result.
- Full Hermes campaigns and the hosted GitHub Actions jobs were not run locally. The isolated Hermes target is not installed in this checkout.
