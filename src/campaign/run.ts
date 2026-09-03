import { writeInbox } from './inbox.ts'
import { deleteInternalFindings } from '../findings/store.ts'
import { parseDuration } from './duration.ts'
import { runEpisode } from './episode.ts'
import { windowsForEpisode } from '../explorer/surfaces.ts'
import { findPackagedBinary } from '../target/electron-binary.ts'
import type { FuzzerConfig } from '../config.ts'
import { loadGraph, saveGraph, coverageSummary } from '../explorer/coverage.ts'
import { logInfo } from '../log.ts'
import { randomSeed } from '../rng.ts'
import { ensureBuilt } from '../target/build.ts'
import { ensureTarget } from '../target/checkout.ts'
import type { LaunchProfile, WindowKind } from '../types.ts'

export type RunOptions = {
  config: FuzzerConfig
  profile: LaunchProfile
  durationMs: number | null
  actions: number
  seed: number | null
  skipFetch: boolean
  skipBuild: boolean
  unsafeSurfaces: boolean
  extraWindows: WindowKind[] | null
  collectV8: boolean
  keepSandbox: boolean
  reduce: boolean
  workers: number
}

export async function prepareTarget(config: FuzzerConfig, skipFetch: boolean, skipBuild: boolean) {
  const target = ensureTarget(config, skipFetch)
  ensureBuilt(target, skipBuild)
  return target
}

export async function runCampaign(opts: RunOptions): Promise<void> {
  let target = await prepareTarget(opts.config, opts.skipFetch, opts.skipBuild)
  const graph = loadGraph()
  const deadline = opts.durationMs === null ? null : Date.now() + opts.durationMs
  let lastFetch = Date.now()
  let episodes = 0
  let findings = 0

  const pruned = deleteInternalFindings()
  if (pruned > 0) {
    logInfo('removed fuzzer-internal findings', { pruned })
  }
  logInfo('campaign start', {
    sha: target.sha,
    profile: opts.profile,
    actions: opts.actions,
    durationMs: opts.durationMs,
    packagedExists: Boolean(findPackagedBinary(target.desktopRoot)),
  })

  do {
    if (deadline !== null && Date.now() - lastFetch > opts.config.campaign.fetchIntervalMs) {
      target = await prepareTarget(opts.config, false, false)
      lastFetch = Date.now()
    }
    const seed = opts.seed ?? randomSeed()
    const result = await runEpisode({
      config: opts.config,
      target,
      profile: opts.profile,
      seed,
      actions: opts.actions,
      unsafeSurfaces: opts.unsafeSurfaces,
      extraWindows: opts.extraWindows ?? windowsForEpisode(seed),
      collectV8: opts.collectV8,
      keepSandbox: opts.keepSandbox,
      reduce: opts.reduce,
      graph,
    })
    episodes += 1
    if (result.failures.length > 0) {
      findings += 1
    }
    saveGraph(graph)
    const cov = coverageSummary(graph)
    logInfo('episode done', {
      seed: result.seed,
      actions: result.actionCount,
      findings: result.failures.length,
      states: cov.states,
      artifact: result.artifactDir,
    })
    if (opts.seed !== null && opts.durationMs === null) {
      break
    }
  } while (deadline === null ? episodes < 1 : Date.now() < deadline)

  writeInbox()
  logInfo('campaign end', { episodes, findings, sha: target.sha, ...coverageSummary(graph) })
}

export function parseWindowsFlag(value: string | undefined): WindowKind[] {
  if (!value || value === 'main') {
    return []
  }
  const kinds: WindowKind[] = []
  for (const part of value.split(',')) {
    if (part === 'all') {
      return ['hud', 'quick', 'overlay', 'wake']
    }
    if (part === 'hud' || part === 'quick' || part === 'overlay' || part === 'wake') {
      kinds.push(part)
    }
  }
  return kinds
}

export { parseDuration }
