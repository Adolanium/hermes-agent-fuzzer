import type { Sandbox } from '../sandbox.ts'
import { stripCredentials } from '../safety/env.ts'
import type { LaunchProfile, TargetInfo } from '../types.ts'

export function buildAppEnv(input: {
  sandbox: Sandbox
  target: TargetInfo
  profile: LaunchProfile
  extra?: Record<string, string>
}): Record<string, string> {
  const clean = stripCredentials(process.env)
  if (!clean.DISPLAY && process.env.DISPLAY) {
    clean.DISPLAY = process.env.DISPLAY
  }
  if (!clean.XDG_RUNTIME_DIR && process.env.XDG_RUNTIME_DIR) {
    clean.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR
  }

  const env: Record<string, string> = {
    ...clean,
    HERMES_HOME: input.sandbox.hermesHome,
    HERMES_DESKTOP_USER_DATA_DIR: input.sandbox.userDataDir,
    HERMES_DESKTOP_IGNORE_EXISTING: '1',
    HERMES_DESKTOP_APP_NAME: `HermesFuzzer-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    HERMES_DESKTOP_SKIP_QUIT_CONFIRM: '1',
    ...input.extra,
  }

  if (input.profile !== 'packaged') {
    env.HERMES_DESKTOP_HERMES_ROOT = input.target.root
  }

  if (input.profile === 'ui-only' || input.profile === 'packaged') {
    env.HERMES_DESKTOP_BOOT_FAKE = '1'
    env.HERMES_DESKTOP_BOOT_FAKE_STEP_MS = '80'
  }

  return env
}
