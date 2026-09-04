import * as fs from 'node:fs'
import * as path from 'node:path'
import { replayActionsOnFreshApp } from '../campaign/episode.ts'
import type { FuzzerConfig } from '../config.ts'
import { recordReplayAttempt } from '../findings/store.ts'
import { sequenceHash } from '../findings/fingerprint.ts'
import { logInfo } from '../log.ts'
import { readActions } from './actions.ts'
import { readManifest } from './manifest.ts'
import type { ReplayResult } from './result.ts'
import type { TargetInfo, RecordedAction } from '../types.ts'

export type ReplayOptions = {
  config: FuzzerConfig
  target: TargetInfo
  artifactDir: string
  minimized: boolean
  allowDrift: boolean
  unsafeSurfaces: boolean
}

export async function replayArtifact(opts: ReplayOptions, subset?: RecordedAction[], promote = true): Promise<ReplayResult> {
  const manifest = readManifest(opts.artifactDir)
  if (manifest.remote !== opts.target.remote) throw new Error('Artifact remote does not match configured target')
  if (manifest.sha !== opts.target.sha && !opts.allowDrift) throw new Error('Target does not match recorded SHA')
  if (manifest.unsafeSurfaces && !opts.unsafeSurfaces) throw new Error('This artifact requires --unsafe-surfaces to restore its execution conditions')
  const file = path.join(opts.artifactDir, opts.minimized ? 'actions.min.json' : 'actions.json')
  const actions = subset ?? readActions(file)
  // Restore only execution budgets. Reduction budgets remain under operator control.
  const config: FuzzerConfig = { ...opts.config, campaign: { ...opts.config.campaign,
    ...(manifest.campaign ? { bootMs: manifest.campaign.bootMs, hangMs: manifest.campaign.hangMs,
      replayTimeoutMs: manifest.campaign.replayTimeoutMs } : {}),
  } }
  const result = await replayActionsOnFreshApp({
    config, target: opts.target, profile: manifest.profile, mutant: manifest.mutant,
    actions, unsafeSurfaces: opts.unsafeSurfaces, expected: manifest.failure, windows: manifest.windows,
  })
  recordReplayAttempt({ failure: manifest.failure, artifactDir: path.resolve(opts.artifactDir),
    targetSha: opts.target.sha, sequenceHash: sequenceHash(JSON.stringify(actions)), actionCount: actions.length,
    result, allowPromotion: promote && manifest.sha === opts.target.sha,
  })
  fs.writeFileSync(path.join(opts.artifactDir, 'replay-result.json'), JSON.stringify({
    ...result, targetSha: opts.target.sha, recordedSha: manifest.sha, actions: actions.length,
    date: new Date().toISOString(),
  }, null, 2))
  logInfo('replay result', { status: result.status, step: result.step, detail: result.message })
  return result
}
