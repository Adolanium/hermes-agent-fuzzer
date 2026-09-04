import type { LaunchProfile, WindowKind } from '../types.ts'

export const CONFIG_MUTANTS = ['sane', 'broken-yaml', 'missing-provider', 'huge-context', 'bad-url', 'auto-approvals'] as const

export type ConfigMutant = (typeof CONFIG_MUTANTS)[number]

export type WorkflowName =
  | 'palette'
  | 'new-session'
  | 'shortcuts'
  | 'page-actions'
  | 'resize'
  | 'chat-submit'
  | 'settings-save'
  | 'onboarding'

export const PAGE_ACTIONS: ReadonlyArray<{ hash: string; names: readonly string[] }> = [
  { hash: '/cron', names: ['New', 'Create', 'Add job', 'Add'] },
  { hash: '/profiles', names: ['New profile', 'Create', 'Add'] },
  { hash: '/agents', names: ['New', 'Create', 'Add'] },
  { hash: '/messaging', names: ['Add', 'New', 'Connect'] },
  { hash: '/webhooks', names: ['Enable webhooks', 'Add', 'New'] },
  { hash: '/artifacts', names: ['Refresh', 'New', 'Add'] },
  { hash: '/starmap', names: ['Refresh', 'Open', 'New'] },
  { hash: '/command-center', names: ['Refresh', 'Open', 'New'] },
  { hash: '/settings?tab=config:appearance', names: ['Dark', 'Light', 'Save'] },
  { hash: '/settings?tab=about', names: ['Copy', 'Check'] },
  { hash: '/skills?tab=mcp', names: ['Add', 'New', 'Connect'] },
]

export function windowsForEpisode(seed: number): WindowKind[] {
  const n = Math.abs(seed) % 5
  if (n === 0) {
    return []
  }
  if (n === 1) {
    return ['hud']
  }
  if (n === 2) {
    return ['quick']
  }
  if (n === 3) {
    return ['hud', 'quick']
  }
  return ['hud', 'quick', 'overlay', 'wake']
}

export function resolveEpisodeProfile(requested: LaunchProfile, seed: number, packagedExists: boolean): LaunchProfile {
  if (requested !== 'all') {
    return requested
  }
  const n = Math.abs(seed) % (packagedExists ? 4 : 3)
  if (n === 0) {
    return 'mock-backend'
  }
  if (n === 1) {
    return 'ui-only'
  }
  if (n === 2) {
    return 'no-provider'
  }
  return 'packaged'
}

export function pickConfigMutant(seed: number, profile: string): ConfigMutant {
  if (profile === 'no-provider') {
    return 'missing-provider'
  }
  const n = Math.abs(seed) % 7
  if (n === 0) {
    return 'broken-yaml'
  }
  if (n === 1) {
    return 'huge-context'
  }
  if (n === 2) {
    return 'bad-url'
  }
  if (n === 3) {
    return 'auto-approvals'
  }
  return 'sane'
}

export function isConfigMutant(value: string): value is ConfigMutant {
  return CONFIG_MUTANTS.some((item) => item === value)
}

export function resolveReplayMutant(seed: number, profile: string, recorded?: string): ConfigMutant {
  if (recorded && isConfigMutant(recorded)) {
    return recorded
  }
  return pickConfigMutant(seed, profile)
}
