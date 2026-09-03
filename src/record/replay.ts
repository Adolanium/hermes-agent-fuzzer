import * as fs from 'node:fs'
import * as path from 'node:path'

import { replayActionsOnFreshApp } from '../campaign/episode.ts'
import { isLaunchProfile, type FuzzerConfig } from '../config.ts'
import { resolveReplayMutant } from '../explorer/surfaces.ts'
import { logInfo, logWarn } from '../log.ts'
import { readActions } from './actions.ts'
import type { LaunchProfile, TargetInfo } from '../types.ts'

export type ReplayOptions = {
  config: FuzzerConfig
  target: TargetInfo
  artifactDir: string
  minimized: boolean
  allowDrift: boolean
  unsafeSurfaces: boolean
}

function readManifest(artifactDir: string): { sha: string; profile: LaunchProfile; seed: number; mutant?: string } {
  const raw = fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('manifest.json is not an object')
  }
  const record = parsed as Record<string, unknown>
  const sha = typeof record.sha === 'string' ? record.sha : ''
  const profile = typeof record.profile === 'string' && isLaunchProfile(record.profile) ? record.profile : 'mock-backend'
  const seed = typeof record.seed === 'number' ? record.seed : 0
  const mutant = typeof record.mutant === 'string' ? record.mutant : undefined
  return { sha, profile, seed, mutant }
}

export async function replayArtifact(opts: ReplayOptions): Promise<boolean> {
  const manifest = readManifest(opts.artifactDir)
  if (manifest.sha && manifest.sha !== opts.target.sha && !opts.allowDrift) {
    throw new Error(
      `Artifact SHA ${manifest.sha} does not match current target ${opts.target.sha}. Pass --allow-drift to continue.`,
    )
  }
  const file = path.join(opts.artifactDir, opts.minimized ? 'actions.min.json' : 'actions.json')
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`)
  }
  const actions = readActions(file)
  const mutant = resolveReplayMutant(manifest.seed, manifest.profile, manifest.mutant)
  logInfo('replaying artifact', { dir: opts.artifactDir, actions: actions.length, seed: manifest.seed, mutant })
  const result = await replayActionsOnFreshApp({
    config: opts.config,
    target: opts.target,
    profile: manifest.profile,
    mutant,
    actions,
    unsafeSurfaces: opts.unsafeSurfaces,
  })
  if (result.reproduced.length === 0) {
    logWarn('replay did not reproduce a failure')
    return false
  }
  logInfo('replay reproduced', { classes: result.reproduced.map((f) => f.class) })
  return true
}
