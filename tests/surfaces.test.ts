import { describe, expect, it } from 'vitest'

import {
  pickConfigMutant,
  resolveEpisodeProfile,
  resolveReplayMutant,
  surfaceInventory,
  windowsForEpisode,
} from '../src/explorer/surfaces.ts'
import { looksLikeOnboarding, previewBody } from '../src/driver/a11y.ts'
import { looksLikeAssistantReply, noReplyFailure } from '../src/oracle/detect.ts'
import { HASH_ROUTES, PLUGIN_HASHES, SETTINGS_HASHES, SKILLS_HASHES } from '../src/types.ts'

describe('surface inventory', () => {
  it('covers every app route, settings tab, skills tab, and extra window', () => {
    const inventory = surfaceInventory()
    for (const route of HASH_ROUTES) {
      expect(inventory.routes).toContain(route)
    }
    for (const tab of SETTINGS_HASHES) {
      expect(inventory.settingsTabs).toContain(tab)
    }
    for (const tab of SKILLS_HASHES) {
      expect(inventory.skillsTabs).toContain(tab)
    }
    for (const plugin of PLUGIN_HASHES) {
      expect(inventory.routes).toContain(plugin)
    }
    expect(inventory.workflows).toContain('onboarding')
    expect(inventory.windows).toEqual(['main', 'hud', 'quick', 'overlay', 'wake'])
    expect(inventory.oracles).toContain('no-reply')
    expect(inventory.workflows).toContain('chat-submit')
    expect(inventory.workflows).toContain('settings-save')
    expect(inventory.workflows).toContain('palette')
    expect(inventory.pageActions.length).toBeGreaterThan(5)
  })

  it('rotates extra windows and config mutants by seed', () => {
    expect(windowsForEpisode(1)).toEqual(['hud'])
    expect(windowsForEpisode(4)).toEqual(['hud', 'quick', 'overlay', 'wake'])
    expect(resolveEpisodeProfile('mock-backend', 2, false)).toBe('mock-backend')
    expect(resolveEpisodeProfile('all', 2, false)).toBe('no-provider')
    expect(resolveEpisodeProfile('all', 3, true)).toBe('packaged')
    expect(pickConfigMutant(0, 'mock-backend')).toBe('broken-yaml')
    expect(pickConfigMutant(4, 'mock-backend')).toBe('sane')
    expect(pickConfigMutant(99, 'no-provider')).toBe('missing-provider')
    expect(resolveReplayMutant(7, 'mock-backend')).toBe('broken-yaml')
    expect(resolveReplayMutant(7, 'mock-backend', 'huge-context')).toBe('huge-context')
    expect(resolveReplayMutant(7, 'mock-backend', 'not-a-mutant')).toBe('broken-yaml')
  })
})

describe('no-reply oracle', () => {
  it('detects a missing assistant bubble after the mock answered', () => {
    expect(looksLikeAssistantReply('Hello from the fuzzer mock. No tools will run.')).toBe(true)
    expect(looksLikeAssistantReply('New session Settings Cron')).toBe(false)
    expect(noReplyFailure(2, '/').class).toBe('no-reply')
  })
})

describe('onboarding chrome', () => {
  it('treats the first-run overlay copy as onboard', () => {
    expect(looksLikeOnboarding("Let's get you setup with Hermes Agent")).toBe(true)
    expect(looksLikeOnboarding('Starting Hermes…')).toBe(true)
    expect(looksLikeOnboarding("I'll choose a provider later")).toBe(true)
    expect(looksLikeOnboarding('SESSIONS New session Ctrl N')).toBe(false)
    expect(looksLikeOnboarding('SESSIONS New session Starting Hermes…')).toBe(false)
    expect(previewBody('SESSIONS New session Let\'s get you setup with Hermes Agent Connect a model provider')).toContain(
      'get you setup',
    )
  })
})
