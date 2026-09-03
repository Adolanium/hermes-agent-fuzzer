import * as fs from 'node:fs'

import { writeFindingArtifact, writeMinimizedActions } from '../artifacts/write.ts'
import type { FuzzerConfig } from '../config.ts'
import { startJsCoverage, stopJsCoverage, writeCoverageReport } from '../coverage/v8.ts'
import { snapshotAll } from '../driver/a11y.ts'
import { composerSendable, submitComposer, waitForComposer } from '../driver/chat.ts'
import { closeApp, launchDesktop, openAuxWindows, waitReady, type LaunchedApp } from '../driver/electron.ts'
import { evaluateWithHangBudget, performAction } from '../driver/perform.ts'
import { actionKey, hashState, saveGraph, visitState, type CoverageGraph } from '../explorer/coverage.ts'
import { saveCorpusEntry } from '../explorer/mutate.ts'
import { pickAction } from '../explorer/pick.ts'
import { pickPayload } from '../explorer/payloads.ts'
import { pickConfigMutant, resolveEpisodeProfile, type ConfigMutant } from '../explorer/surfaces.ts'
import { runOnboardingWorkflow, runSurfaceWorkflows } from '../explorer/workflows.ts'
import { isFuzzerInternalError } from '../findings/internal.ts'
import { upsertFinding, updateFindingStatus } from '../findings/store.ts'
import { logInfo, logWarn } from '../log.ts'
import { startMockServer, type MockServer } from '../mock/server.ts'
import {
  bootTimeoutFailure,
  hardFailure,
  looksLikeAssistantReply,
  noReplyFailure,
  persistableFailures,
  perfFailure,
  pollOracles,
  readAgentLog,
  readDesktopLog,
} from '../oracle/detect.ts'
import { cheapCuts, ddmin } from '../reduce/ddmin.ts'
import { SeededRng } from '../rng.ts'
import { createSandbox, prepareProfileConfig, removeSandbox, sandboxLooksIsolated, type Sandbox } from '../sandbox.ts'
import { cheapSoftMinimize } from '../reduce/soft.ts'
import { findPackagedBinary } from '../target/electron-binary.ts'
import { buildAppEnv } from '../target/launch.ts'
import { WARMUP_ROUTES, type Failure, type LaunchProfile, type RecordedAction, type TargetInfo, type UiSnapshot, type WindowKind } from '../types.ts'

export type EpisodeOptions = {
  config: FuzzerConfig
  target: TargetInfo
  profile: LaunchProfile
  seed: number
  actions: number
  unsafeSurfaces: boolean
  extraWindows: WindowKind[]
  collectV8: boolean
  keepSandbox: boolean
  reduce: boolean
  graph: CoverageGraph
}

export type EpisodeResult = {
  seed: number
  actionCount: number
  failures: Failure[]
  artifactDir: string | null
}

async function teardown(input: {
  launched: LaunchedApp | null
  mock: MockServer | null
  sandbox: Sandbox
  keep: boolean
}): Promise<void> {
  if (input.launched) {
    await closeApp(input.launched)
  }
  if (input.mock) {
    await input.mock.close().catch(() => undefined)
  }
  if (!input.keep) {
    removeSandbox(input.sandbox)
  }
}

export async function runEpisode(opts: EpisodeOptions): Promise<EpisodeResult> {
  const sandbox = createSandbox(opts.profile)
  assertSandboxIsolation(sandbox)
  let mock: MockServer | null = null
  let launched: LaunchedApp | null = null
  const rng = new SeededRng(opts.seed)
  const tried = new Set<string>()
  const triedEdges = new Set<string>()
  const actions: RecordedAction[] = []
  const shots: Buffer[] = []
  let snapshots: UiSnapshot[] = []
  const profile = resolveEpisodeProfile(
    opts.profile,
    opts.seed,
    Boolean(findPackagedBinary(opts.target.desktopRoot)),
  )
  const mutant = pickConfigMutant(opts.seed, profile)

  try {
    if (profile === 'mock-backend' || profile === 'ui-only') {
      mock = await startMockServer({ unsafeTools: opts.unsafeSurfaces })
    }
    prepareProfileConfig(sandbox, profile, mock?.url ?? null, mutant)
    const env = buildAppEnv({ sandbox, target: opts.target, profile })
    launched = await launchDesktop({ target: opts.target, profile, env })
    if (opts.collectV8) {
      await startJsCoverage(launched.main)
    }
    try {
      await waitReady(launched.main, opts.config.campaign.bootMs, {
        leaveOnboarding: profile === 'no-provider',
      })
    } catch {
      const failure = bootTimeoutFailure()
      return await finishWithFailure({
        opts,
        sandbox,
        launched,
        mock,
        actions,
        snapshots,
        shots,
        failures: [failure],
        profile,
        mutant,
      })
    }
    if (opts.extraWindows.length > 0) {
      await openAuxWindows(launched, opts.extraWindows)
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    snapshots = await snapshotAll(launched.pages, opts.unsafeSurfaces)
    const bootSnap = snapshots.find((s) => s.window === 'main') ?? snapshots[0]
    logInfo('boot snapshot', {
      profile,
      view: bootSnap?.view,
      bootPhase: bootSnap?.bootPhase,
      route: bootSnap?.route,
      body: bootSnap?.bodyPreview,
      windowsRequested: opts.extraWindows,
      windows: [...launched.pages.keys()],
      wakeOpened: launched.pages.has('wake'),
      packagedExists: Boolean(findPackagedBinary(opts.target.desktopRoot)),
    })

    if (!launched) {
      throw new Error('Desktop failed to launch')
    }
    const app = launched
    const visitedRoutes = new Set<string>(['/'])
    const seenSoft: Failure[] = []
    let onboardReached = bootSnap?.bootPhase === 'onboard'
    let chatReceived = false
    const workflows = await (async () => {
      if (profile === 'no-provider') {
        const onboard = await runOnboardingWorkflow({
          launched: app,
          actions,
          timeoutMs: opts.config.campaign.actionTimeoutMs,
          unsafeSurfaces: opts.unsafeSurfaces,
        })
        onboardReached = onboard.reached || onboardReached
        await warmupRoutes(app, actions, visitedRoutes, opts.config.campaign.actionTimeoutMs)
        return onboard.workflows
      }
      await warmupRoutes(app, actions, visitedRoutes, opts.config.campaign.actionTimeoutMs)
      await pokeChat(app, actions, rng, opts.config.campaign.actionTimeoutMs, mock, ['__mock_ok__'])
      if (mock && mock.receivedPrompts.length > 0 && !app.main.isClosed()) {
        chatReceived = await waitForMockReply(app, opts.config.campaign.hangMs)
      }
      const ran = await runSurfaceWorkflows({
        launched: app,
        actions,
        timeoutMs: opts.config.campaign.actionTimeoutMs,
        unsafeSurfaces: opts.unsafeSurfaces,
      })
      await pokeChat(app, actions, rng, opts.config.campaign.actionTimeoutMs, mock, ['__mock_500__'])
      ran.push('chat-submit')
      if (mock && mock.receivedPrompts.length > 0 && !app.main.isClosed() && !chatReceived) {
        chatReceived = await waitForMockReply(app, opts.config.campaign.hangMs)
        if (!chatReceived) {
          seenSoft.push(noReplyFailure(mock.receivedPrompts.length, '/'))
        }
      }
      return ran
    })()

    let lastShot: string | null = null
    let hits = 0
    let misses = 0
    for (let i = 0; i < opts.actions; i += 1) {
      if (launched.closed) {
        break
      }
      snapshots = await snapshotAll(launched.pages, opts.unsafeSurfaces)
      const mainSnap = snapshots.find((s) => s.window === 'main') ?? snapshots[0]
      if (mainSnap) {
        visitState(opts.graph, hashState(mainSnap))
        if (mainSnap.route) {
          visitedRoutes.add(mainSnap.route)
        }
      }
      const action = pickAction({
        ctx: { snapshots, rng, tried, now: Date.now() },
        graph: opts.graph,
        triedEdges,
        useModel: true,
        useMutation: true,
      })
      if (action.type === 'click' || action.type === 'type' || action.type === 'contextmenu') {
        const name = 'name' in action.locator ? action.locator.name : action.type
        tried.add(actionKey(action.type, name, action.type))
      }
      actions.push(action)
      const performed = await performAction(launched, action, opts.config.campaign.actionTimeoutMs)
      if (performed.ok) {
        hits += 1
      } else {
        misses += 1
      }
      if (performed.ok && shouldSubmitAfterType(action) && rng.chance(0.85)) {
        const submit: RecordedAction = {
          type: 'press',
          t: Date.now(),
          seedStep: rng.step,
          key: 'Enter',
          window: action.locator.window,
        }
        actions.push(submit)
        const submitted = await performAction(launched, submit, opts.config.campaign.actionTimeoutMs)
        if (submitted.ok) {
          hits += 1
        } else {
          misses += 1
        }
      }
      if (performed.ok && performed.elapsedMs >= opts.config.campaign.perfWarnMs) {
        logWarn('slow action', { elapsedMs: performed.elapsedMs, type: action.type })
      }
      const oracle = await pollOracles({
        launched,
        hermesHome: sandbox.hermesHome,
        snapshots,
        hangMs: opts.config.campaign.hangMs,
        previousShotB64: lastShot,
        takeScreenshot: false,
      })
      lastShot = oracle.lastShotB64
      if (performed.ok && i % opts.config.campaign.screenshotEvery === 0) {
        try {
          const shot = await launched.main.screenshot({ type: 'png' })
          shots.push(shot)
          if (shots.length > opts.config.campaign.screenshotDepth) {
            shots.shift()
          }
        } catch {
          // window gone
        }
      }

      const hard = hardFailure(oracle)
      const soft = oracle.failures.filter((f) => f.severity === 'soft')
      if (performed.ok && performed.elapsedMs >= opts.config.campaign.perfWarnMs) {
        soft.push(perfFailure(performed.elapsedMs, mainSnap?.route))
      }
      seenSoft.push(...soft.filter((f) => f.class !== 'perf'))
      if (hard) {
        return await finishWithFailure({
          opts,
          sandbox,
          launched,
          mock,
          actions,
          snapshots,
          shots,
          failures: oracle.failures,
          profile,
          mutant,
        })
      }
      if (soft.length > 0 && mainSnap) {
        saveCorpusEntry({
          id: `${opts.seed}-${i}`,
          stateId: hashState(mainSnap),
          actions: actions.slice(),
        })
      }
    }

    if (opts.collectV8 && launched) {
      const files = await stopJsCoverage(launched.main).catch(() => [])
      if (files.length > 0) {
        writeCoverageReport(files)
      }
    }

    const keptSoft = persistableFailures(seenSoft.filter((f) => !isFuzzerInternalError(f)))
    logInfo('episode stats', {
      seed: opts.seed,
      hits,
      misses,
      routes: [...visitedRoutes],
      windows: launched ? [...launched.pages.keys()] : [],
      workflows,
      profile,
      mutant,
      view: snapshots.find((s) => s.window === 'main')?.view ?? bootSnap?.view,
      bootPhase: snapshots.find((s) => s.window === 'main')?.bootPhase ?? bootSnap?.bootPhase,
      prompts: mock?.receivedPrompts.length ?? 0,
      errorPings: mock?.receivedPrompts.filter((p) => p.includes('__mock_500__')).length ?? 0,
      chatReceived,
      settingsSaved: workflows.includes('settings-save'),
      onboardReached,
      soft: keptSoft.length,
      alerts: keptSoft.filter((f) => f.class === 'alert').length,
    })
    if (keptSoft.length > 0) {
      return await finishWithFailure({
        opts,
        sandbox,
        launched,
        mock,
        actions,
        snapshots,
        shots,
        failures: keptSoft,
        profile,
        mutant,
      })
    }

    await teardown({ launched, mock, sandbox, keep: opts.keepSandbox })
    saveGraph(opts.graph)
    return { seed: opts.seed, actionCount: actions.length, failures: [], artifactDir: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failure: Failure = {
      class: message.startsWith('hang:') ? 'hang' : 'pageerror',
      severity: 'hard',
      message,
      stack: error instanceof Error ? error.stack : undefined,
    }
    return await finishWithFailure({
      opts,
      sandbox,
      launched,
      mock,
      actions,
      snapshots,
      shots,
      failures: [failure],
      profile,
      mutant,
    })
  }
}

async function finishWithFailure(input: {
  opts: EpisodeOptions
  sandbox: Sandbox
  launched: LaunchedApp | null
  mock: MockServer | null
  actions: RecordedAction[]
  snapshots: UiSnapshot[]
  shots: Buffer[]
  failures: Failure[]
  profile: LaunchProfile
  mutant: ConfigMutant
}): Promise<EpisodeResult> {
  const failure = input.failures[0] ?? {
    class: 'pageerror' as const,
    severity: 'hard' as const,
    message: 'unknown failure',
  }
  const kept = persistableFailures(input.failures.filter((item) => !isFuzzerInternalError(item)))
  if (kept.length === 0) {
    if (input.failures.some(isFuzzerInternalError)) {
      logWarn('ignored fuzzer-internal renderer error', { message: failure.message.slice(0, 160) })
    }
    await teardown({
      launched: input.launched,
      mock: input.mock,
      sandbox: input.sandbox,
      keep: input.opts.keepSandbox,
    })
    saveGraph(input.opts.graph)
    return { seed: input.opts.seed, actionCount: input.actions.length, failures: [], artifactDir: null }
  }
  const primary = kept[0] ?? failure
  if (input.launched && !input.launched.main.isClosed()) {
    try {
      input.shots.push(await input.launched.main.screenshot({ type: 'png' }))
    } catch {
      // already gone
    }
  }
  const artifact = writeFindingArtifact({
    target: input.opts.target,
    profile: input.profile,
    mutant: input.mutant,
    seed: input.opts.seed,
    actions: input.actions,
    failure: primary,
    snapshots: input.snapshots,
    stdout: input.launched?.stdout.join('') ?? '',
    stderr: input.launched?.stderr.join('') ?? '',
    desktopLog: readDesktopLog(input.sandbox.hermesHome),
    agentLog: readAgentLog(input.sandbox.hermesHome),
    pageErrors: input.launched?.pageErrors ?? [],
    screenshots: input.shots,
    hermesHome: input.sandbox.hermesHome,
  })
  const stored = upsertFinding({
    failure: primary,
    artifactDir: artifact.dir,
    actionCount: input.actions.length,
    status: 'new',
  })
  logInfo('wrote finding', { dir: artifact.dir, duplicate: stored.duplicate, class: primary.class })
  for (const extra of kept.slice(1)) {
    const extraStored = upsertFinding({
      failure: extra,
      artifactDir: artifact.dir,
      actionCount: input.actions.length,
      status: 'new',
    })
    logInfo('wrote finding', { dir: artifact.dir, duplicate: extraStored.duplicate, class: extra.class })
  }

  if (input.opts.reduce && primary.severity === 'hard' && input.actions.length > 1 && !stored.duplicate) {
    const minimized = await minimizeFinding(input.opts, input.actions, primary, input.profile, input.mutant)
    if (minimized) {
      writeMinimizedActions(artifact.dir, minimized)
      updateFindingStatus(stored.finding.id, 'reproducible', minimized.length)
    } else {
      updateFindingStatus(stored.finding.id, 'flaky')
    }
  } else if (primary.severity === 'soft' && input.actions.length > 1 && !stored.duplicate) {
    const minimized = cheapSoftMinimize(primary, input.actions)
    if (minimized) {
      writeMinimizedActions(artifact.dir, minimized)
      updateFindingStatus(stored.finding.id, 'new', minimized.length)
    }
  }

  await teardown({
    launched: input.launched,
    mock: input.mock,
    sandbox: input.sandbox,
    keep: input.opts.keepSandbox,
  })
  saveGraph(input.opts.graph)
  return {
    seed: input.opts.seed,
    actionCount: input.actions.length,
    failures: kept,
    artifactDir: artifact.dir,
  }
}

async function replaySequence(
  opts: EpisodeOptions,
  sequence: RecordedAction[],
  expect: Failure,
  profile: LaunchProfile,
  mutant: ConfigMutant,
): Promise<boolean> {
  const sandbox = createSandbox('reduce')
  assertSandboxIsolation(sandbox)
  let mock: MockServer | null = null
  let launched: LaunchedApp | null = null
  try {
    if (profile === 'mock-backend' || profile === 'ui-only') {
      mock = await startMockServer({ unsafeTools: opts.unsafeSurfaces })
    }
    prepareProfileConfig(sandbox, profile, mock?.url ?? null, mutant)
    const env = buildAppEnv({ sandbox, target: opts.target, profile })
    launched = await launchDesktop({ target: opts.target, profile, env })
    await waitReady(launched.main, opts.config.campaign.bootMs)
    for (const action of sequence) {
      await performAction(launched, action, opts.config.campaign.replayTimeoutMs)
    }
    const snapshots = await snapshotAll(launched.pages, opts.unsafeSurfaces)
    const oracle = await pollOracles({
      launched,
      hermesHome: sandbox.hermesHome,
      snapshots,
      hangMs: opts.config.campaign.hangMs,
      previousShotB64: null,
    })
    return oracle.failures.some((f) => f.class === expect.class)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return expect.class === 'hang' ? message.startsWith('hang:') : expect.class === 'boot-timeout'
  } finally {
    await teardown({ launched, mock, sandbox, keep: false })
  }
}

async function minimizeFinding(
  opts: EpisodeOptions,
  actions: RecordedAction[],
  failure: Failure,
  profile: LaunchProfile,
  mutant: ConfigMutant,
): Promise<RecordedAction[] | null> {
  const started = Date.now()
  let replays = 0
  const pred = async (subset: RecordedAction[]): Promise<boolean> => {
    if (Date.now() - started > opts.config.campaign.reduceBudgetMs) {
      return false
    }
    if (replays >= opts.config.campaign.reduceMaxReplays) {
      return false
    }
    replays += 1
    logInfo('reduce replay', { actions: subset.length, replay: replays })
    return replaySequence(opts, subset, failure, profile, mutant)
  }

  if (!(await pred(actions))) {
    logWarn('original sequence did not reproduce')
    return null
  }
  for (const cut of cheapCuts(actions)) {
    if (await pred(cut)) {
      const reduced = await ddmin(cut, pred)
      return reduced
    }
  }
  return ddmin(actions, pred)
}

export async function replayActionsOnFreshApp(input: {
  config: FuzzerConfig
  target: TargetInfo
  profile: LaunchProfile
  mutant?: ConfigMutant
  actions: RecordedAction[]
  unsafeSurfaces: boolean
}): Promise<{ reproduced: Failure[] }> {
  const sandbox = createSandbox('replay')
  assertSandboxIsolation(sandbox)
  let mock: MockServer | null = null
  let launched: LaunchedApp | null = null
  try {
    if (input.profile === 'mock-backend' || input.profile === 'ui-only') {
      mock = await startMockServer({ unsafeTools: input.unsafeSurfaces })
    }
    prepareProfileConfig(sandbox, input.profile, mock?.url ?? null, input.mutant)
    const env = buildAppEnv({ sandbox, target: input.target, profile: input.profile })
    launched = await launchDesktop({ target: input.target, profile: input.profile, env })
    await waitReady(launched.main, input.config.campaign.bootMs)
    for (const action of input.actions) {
      await performAction(launched, action, input.config.campaign.replayTimeoutMs)
    }
    const snapshots = await snapshotAll(launched.pages, input.unsafeSurfaces)
    const oracle = await pollOracles({
      launched,
      hermesHome: sandbox.hermesHome,
      snapshots,
      hangMs: input.config.campaign.hangMs,
      previousShotB64: null,
    })
    if (mock && mock.receivedPrompts.length > 0 && !launched.main.isClosed()) {
      const body = await evaluateWithHangBudget(launched.main, input.config.campaign.hangMs).catch(() => '')
      if (!looksLikeAssistantReply(body)) {
        oracle.failures.push(noReplyFailure(mock.receivedPrompts.length, '/'))
      }
    }
    return { reproduced: oracle.failures }
  } finally {
    await teardown({ launched, mock, sandbox, keep: false })
  }
}

export function assertSandboxIsolation(sandbox: Sandbox): void {
  if (!sandboxLooksIsolated(sandbox.hermesHome, sandbox.userDataDir)) {
    throw new Error('Refusing to use the real Hermes profile directories')
  }
}

function shouldSubmitAfterType(
  action: RecordedAction,
): action is Extract<RecordedAction, { type: 'type' }> {
  if (action.type !== 'type') {
    return false
  }
  const name =
    action.locator.strategy === 'role' || action.locator.strategy === 'aria'
      ? action.locator.name.toLowerCase()
      : ''
  if (name.includes('composer')) {
    return true
  }
  if (action.locator.strategy === 'css' && action.locator.css.includes('contenteditable')) {
    return true
  }
  return action.locator.strategy === 'role' && (action.locator.role === 'textbox' || action.locator.role === 'searchbox')
}

async function warmupRoutes(
  launched: LaunchedApp,
  actions: RecordedAction[],
  visitedRoutes: Set<string>,
  timeoutMs: number,
): Promise<void> {
  for (const hash of WARMUP_ROUTES) {
    if (hash === '/') {
      continue
    }
    const action: RecordedAction = {
      type: 'navigate',
      t: Date.now(),
      seedStep: actions.length,
      hash,
      window: 'main',
    }
    actions.push(action)
    await performAction(launched, action, timeoutMs)
    visitedRoutes.add(hash)
  }
  const home: RecordedAction = {
    type: 'navigate',
    t: Date.now(),
    seedStep: actions.length,
    hash: '/',
    window: 'main',
  }
  actions.push(home)
  await performAction(launched, home, timeoutMs)
}

async function waitForMockReply(launched: LaunchedApp, hangMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.min(Math.max(hangMs, 2000), 8000)
  while (Date.now() < deadline) {
    if (launched.main.isClosed()) {
      return false
    }
    const body = await evaluateWithHangBudget(launched.main, hangMs).catch(() => '')
    if (looksLikeAssistantReply(body)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

async function pokeChat(
  launched: LaunchedApp,
  actions: RecordedAction[],
  rng: SeededRng,
  timeoutMs: number,
  mock: MockServer | null,
  extraPayloads: string[] = [],
): Promise<void> {
  await performAction(
    launched,
    { type: 'press', t: Date.now(), seedStep: actions.length, key: 'Escape', window: 'main' },
    timeoutMs,
  )
  await performAction(
    launched,
    { type: 'navigate', t: Date.now(), seedStep: actions.length, hash: '/', window: 'main' },
    timeoutMs,
  )
  const ready = await waitForComposer(launched.main, 20000)
  if (!ready || !(await composerSendable(launched.main).catch(() => false))) {
    logWarn('composer not sendable, skipping chat poke')
    return
  }
  const queue =
    extraPayloads.length > 0
      ? extraPayloads
      : [pickPayload(rng).trim() || 'fuzzer ping 1', pickPayload(rng).trim() || 'fuzzer ping 2']
  for (let i = 0; i < queue.length; i += 1) {
    const payload = queue[i] ?? `fuzzer ping ${i + 1}`
    const type: RecordedAction = {
      type: 'type',
      t: Date.now(),
      seedStep: actions.length,
      locator: { strategy: 'css', css: '[data-slot="composer-rich-input"]', nth: 0, window: 'main' },
      value: payload,
    }
    actions.push(type)
    const inserted = await submitComposer(launched.main, payload)
    if (!inserted) {
      logWarn('composer submit missed', { payload: payload.slice(0, 40) })
      await performAction(launched, type, timeoutMs)
      await performAction(
        launched,
        { type: 'press', t: Date.now(), seedStep: actions.length, key: 'Enter', window: 'main' },
        timeoutMs,
      )
    } else {
      actions.push({
        type: 'click',
        t: Date.now(),
        seedStep: actions.length,
        locator: { strategy: 'css', css: '[data-slot="composer-root"] button[type="submit"]', nth: 0, window: 'main' },
      })
    }
    const before = mock?.receivedPrompts.length ?? 0
    const wait: RecordedAction = {
      type: 'wait',
      t: Date.now(),
      seedStep: actions.length,
      ms: 800,
    }
    actions.push(wait)
    await performAction(launched, wait, timeoutMs)
    if (mock) {
      const deadline = Date.now() + 4000
      while (Date.now() < deadline && mock.receivedPrompts.length <= before) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      if (mock.receivedPrompts.length <= before) {
        logWarn('chat poke produced no mock receipt', { payload: payload.slice(0, 40) })
      }
    }
  }
}
