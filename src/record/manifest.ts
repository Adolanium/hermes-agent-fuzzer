import * as fs from 'node:fs'
import * as path from 'node:path'
import { isLaunchProfile, type FuzzerConfig } from '../config.ts'
import { CONFIG_MUTANTS, resolveReplayMutant, type ConfigMutant } from '../explorer/surfaces.ts'
import type { Failure, LaunchProfile, WindowKind } from '../types.ts'
import { isWindowKind } from './actions.ts'

export type ReplayManifest = {
  sha: string
  remote: string
  profile: LaunchProfile
  seed: number
  mutant: ConfigMutant
  failure: Failure
  windows?: WindowKind[]
  campaign?: FuzzerConfig['campaign']
  unsafeSurfaces: boolean
}

export function isFailure(value: unknown): value is Failure {
  if (!value || typeof value !== 'object') return false
  const f = value as Record<string, unknown>
  return typeof f.class === 'string' && ['process-exit', 'pageerror', 'crash', 'hang', 'error-boundary', 'uncaught-main', 'alert', 'frozen-ui', 'boot-timeout', 'no-reply', 'perf'].includes(f.class)
    && (f.severity === 'hard' || f.severity === 'soft') && typeof f.message === 'string'
    && ['stack', 'route', 'alertText'].every((key) => f[key] === undefined || typeof f[key] === 'string')
}

export function readManifest(dir: string): ReplayManifest {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>
  if (!m || typeof m !== 'object' || (m.schemaVersion !== undefined && m.schemaVersion !== 1)) throw new Error('Unsupported artifact manifest')
  if (typeof m.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(m.sha)) throw new Error('Manifest requires a full Git SHA')
  if (typeof m.remote !== 'string' || !m.remote) throw new Error('Manifest requires a target remote')
  if (typeof m.profile !== 'string' || !isLaunchProfile(m.profile) || m.profile === 'all') throw new Error('Manifest requires a resolved profile')
  if (typeof m.seed !== 'number' || !Number.isSafeInteger(m.seed)) throw new Error('Invalid manifest seed')
  if (!isFailure(m.failure)) throw new Error('Invalid manifest failure')
  if (m.mutant !== undefined && !CONFIG_MUTANTS.includes(m.mutant as ConfigMutant)) throw new Error('Invalid manifest mutant')
  if (m.windows !== undefined && (!Array.isArray(m.windows) || !m.windows.every(isWindowKind))) throw new Error('Invalid manifest windows')
  if (m.unsafeSurfaces !== undefined && typeof m.unsafeSurfaces !== 'boolean') throw new Error('Invalid unsafeSurfaces')
  if (m.campaign !== undefined) {
    if (!m.campaign || typeof m.campaign !== 'object') throw new Error('Invalid replay budgets')
    for (const key of ['bootMs', 'hangMs', 'replayTimeoutMs']) {
      const value = (m.campaign as Record<string, unknown>)[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid replay budget: ${key}`)
    }
  }
  return {
    sha: m.sha, remote: m.remote, profile: m.profile, seed: m.seed,
    mutant: resolveReplayMutant(m.seed, m.profile, m.mutant as string | undefined),
    failure: m.failure, windows: m.windows as WindowKind[] | undefined,
    campaign: m.campaign as FuzzerConfig['campaign'] | undefined,
    unsafeSurfaces: m.unsafeSurfaces === true,
  }
}
