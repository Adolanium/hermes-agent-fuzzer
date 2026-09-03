# Hermes Agent Desktop Fuzzer

Find Desktop failures before a user does.

A private campaign runner for Hermes Agent Desktop. It clones `main`, builds Electron, and walks the live UI. When something breaks, you get a seed, an action list, logs, screenshots, and a repro you can replay.

This product is independent of the public Hermes Agent repository. Desktop is the target, not the home of this code. Keep it that way.

## What it catches

Desktop is Electron 40 and React 19. First-run, chat, settings, and extra windows fail in ways unit tests miss. A locked profile, a bad `config.yaml`, or a hung renderer does not show up in a component test.

This runner launches an isolated process, drives the live app, and writes an inbox. Same seed, same SHA, same failure.

**Isolation is the contract.** Every episode gets a temp `HERMES_HOME` and `HERMES_DESKTOP_USER_DATA_DIR`, plus a unique `HERMES_DESKTOP_APP_NAME` so the single-instance lock cannot steal the operator's real app. Credentials are stripped from the child environment. The fuzzer never writes to `%LOCALAPPDATA%\hermes` or `%APPDATA%\Hermes`. It never commits, pushes, or edits tracked files in the Hermes checkout.

Do not add this tree to public `hermes-agent` CI.

## What you get

- Campaigns that rotate profiles, windows, and config mutants from a seed
- Coverage of main, HUD, Quick Entry, overlay, and wake, plus every hash route and settings tab the explorer knows
- Oracles for process exit, renderer crash, hang, error boundary, vanished windows, boot timeout, interesting alerts, frozen UI, and chat with no reply
- Findings clustered by fingerprint, with hit counts and the shortest sequence kept
- Replay of the recorded action list, not the seed alone
- Hierarchical reduce for hard faults, cheap cuts for soft `no-reply` and alert findings
- A mock LLM that never returns `tool_calls` unless you opt in

## Start in one click

Double-click `fuzz.bat`. It installs dependencies if needed, builds Desktop the first time, then runs one episode. The window stays open so you can read the output.

```bat
fuzz.bat
fuzz.bat 8h
fuzz.bat 30m ui-only
```

A timed run defaults to profile `all`. `test.bat` runs the unit suite the same way.

### Requirements

- Node 22.22 or newer
- Git
- A logged-in Windows desktop session. Electron needs a real display. A locked or dead RDP session will flake.
- Python 3.11+ and `uv` for the default `mock-backend` profile

An existing local Hermes checkout is optional. Set `target.cloneReference` in `fuzzer.config.json` to use it as a git object cache. The fuzzer still keeps its own copy under `_targets/`.

## Commands

```powershell
npm install
npx tsx src/cli.ts prepare
npx tsx src/cli.ts run
npx tsx src/cli.ts run --duration 8h --profile all
npx tsx src/cli.ts run --profile mock-backend --windows all --seed 11 --actions 50
npx tsx src/cli.ts replay artifacts\findings\<id>
npx tsx src/cli.ts replay artifacts\findings\<id> --minimized
npx tsx src/cli.ts reduce artifacts\findings\<id>
npx tsx src/cli.ts inbox
```

`prepare` fetches latest `main` and builds Desktop. `run` does that, then plays episodes. One episode with 50 actions is the default. `--duration` keeps going until the clock runs out.

| Flag | Purpose |
| --- | --- |
| `--profile` | `mock-backend`, `ui-only`, `no-provider`, `packaged`, or `all` |
| `--windows` | `main`, `hud,quick`, or `all`. Omit to rotate extras by seed |
| `--seed`, `--actions` | Deterministic episode |
| `--skip-fetch`, `--skip-build` | Reuse the current target |
| `--unsafe-surfaces` | Denylist off. Mock may return `tool_calls` |
| `--coverage` | Optional V8 / CDP report |
| `--keep-sandbox`, `--no-reduce`, `--allow-drift`, `--minimized` | Replay and debug |

Copy `fuzzer.config.example.json` to `fuzzer.config.json` to override remotes and budgets. The example is safe to commit. The local file is gitignored.

## Profiles

| Profile | What it proves |
| --- | --- |
| `mock-backend` | Real `hermes serve`, fake LLM. Default. No tool calls unless `--unsafe-surfaces`. |
| `ui-only` | Fake boot overlay and a mock provider so onboarding does not block. No Python. |
| `no-provider` | Empty `config.yaml`. First-run overlay stays on. Walks "I'll choose a provider later" and Settings → Providers. |
| `packaged` | `Hermes.exe` from the isolated target's `release/win-unpacked` if you already packed it. Skipped when the exe is missing. |
| `all` | Rotates the profiles above. Packaged joins the rotation only when the exe exists. |

Each episode also picks a config mutant from the seed: sane, broken-yaml, missing-provider, huge-context, bad-url, auto-approvals.

## Coverage

This is the inventory the explorer actually uses.

**Windows.** Main, HUD, Quick Entry, overlay, wake. Native wake is macOS-only. On Windows the fuzzer still loads `?win=wake` so that renderer is visited.

**Hash routes.** `/`, `/settings`, `/skills`, `/messaging`, `/webhooks`, `/artifacts`, `/cron`, `/profiles`, `/agents`, `/starmap`, `/command-center`.

**Settings tabs.** Model, chat, appearance, workspace, safety, browser, memory, voice, advanced, providers, gateway, keybinds, keys, notifications, billing, plugins, sessions, about.

**Skills tabs.** Skills, toolsets, MCP. Plugin route in this Desktop tree: `/kanban`.

**Workflows.** Command palette, new session, shortcuts, page actions on cron / profiles / agents / messaging / webhooks / artifacts / starmap / command-center, appearance save, chat submit, first-run onboarding, resize.

**Chat.** Real keystrokes into `[data-slot="composer-rich-input"]`. `__mock_ok__` is a guaranteed reply. `__mock_500__` is a guaranteed error. Random prompts can still 500, truncate, or return long / RTL / markdown.

## How a campaign works

One process owns the run. It updates the target, builds Desktop when the SHA changed, then plays episodes.

1. Make a temp sandbox and write `config.yaml` for the profile and mutant.
2. Start the mock LLM if the profile needs it.
3. Launch `electron .` against `apps/desktop/dist` with `--disable-gpu --no-sandbox`.
4. Wait until chat, onboarding, or a boot-failure overlay is visible.
5. Open extra windows if the seed or `--windows` asked for them.
6. Warm up every hash, settings, skills, and plugin route.
7. Run the scripted workflows and poke chat.
8. Spend the action budget. Unseen widgets first, then model edges, then corpus mutation, then random. About one in five steps is chaos.
9. After every action, run oracles. Hard faults stop the episode. Soft faults are stored and the episode can finish.
10. Close Electron, kill leftover PIDs, close the mock, delete the sandbox unless `--keep-sandbox`.

State id for coverage is `hash(route + overlay + dialog + visible role names + boot phase)`. The graph persists across episodes so nightly runs remember which screens are stale.

The target clone lives in `_targets/hermes-agent` (gitignored). The fuzzer fetches and detaches to `origin/main`. Build output under `apps/desktop/dist` is allowed. If the SHA, lockfile, and Node version match, rebuild is skipped.

The mock LLM never returns `tool_calls` unless you pass `--unsafe-surfaces` and send `__mock_tools__`. A denylist blocks updates, OAuth, diagnostics upload, git plugin installs, and xterm typing unless that same flag is on.

## Oracles

Hard findings always stop the episode:

- Electron process exit
- Playwright `pageerror`, renderer crash, `render-process-gone`
- Main-process `Uncaught exception` / `Unhandled rejection` in `desktop.log`
- Hang: `page.evaluate` past the hang budget (20s)
- Error boundary / "something broke in the interface"
- Window vanished while the process is still alive
- Boot never reaches a ready UI

Soft findings are stored and the campaign continues:

- Interesting `[role="alert"]` text. Info banners like "Copied" are dropped.
- Frozen UI: identical screenshot and no widgets, or a ready shell with nothing to click
- Chat submitted and the UI showed no assistant reply
- Console / `desktop.log` faults that look like real renderer errors. Fuzzer-injected `__name is not defined` is ignored.
- Slow actions are logged as perf and are not persisted

## Findings

Each finding lands in `artifacts/findings/<stamp>-<id>/`. `npx tsx src/cli.ts inbox` is the human surface. SQLite clusters by fingerprint (`class + stack top + route + alert`). The same fingerprint increments the hit count and keeps the shorter sequence.

Every artifact includes:

- `manifest.json` (SHA, remote, OS, Node, fuzzer version, seed, profile, mutant)
- `repro.md` (numbered steps)
- `actions.json` / `actions.min.json`
- `seed.txt`, `config.yaml`
- `stdout.log`, `stderr.log`, `desktop.log`, `agent.log`, `pageerror.log`
- screenshots and `state.json`

Replay the recorded list. Same SHA is required unless `--allow-drift`. Replay restores the same profile and config mutant.

Hard findings can run hierarchical delta debugging (15 minutes or 40 replays). Soft `no-reply` / `alert` findings get a cheap cut that keeps chat and navigate steps. If the original sequence does not reproduce, the finding is marked `flaky`. The artifact stays.

## Nightly

`scripts/nightly.ps1` runs an 8 hour campaign. `scripts/install-nightly-task.ps1` registers it with Task Scheduler. The machine must be logged in.

Unit tests live in this repo. A short smoke job lives in `.github/workflows/smoke.yml` here only. Fail that job on hard crash or error boundary, not on alerts. Do not gate public Hermes PRs on it.

## Scope

Packaged stays skip-only until `Hermes.exe` is in the isolated target's `release/win-unpacked`. Native wake will not appear on Windows. Tool-call loops stay behind `--unsafe-surfaces`. One worker on Windows. Linux xvfb and macOS are not first-class yet. Plugin pages besides `/kanban` only show up if Desktop contributes them.

Run it. Read the inbox. Replay what it finds.
