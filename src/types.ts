export type LaunchProfile = 'mock-backend' | 'ui-only' | 'no-provider' | 'packaged' | 'all'

export type WindowKind = 'main' | 'hud' | 'quick' | 'overlay' | 'wake' | 'unknown'

export type ModelView =
  | 'boot'
  | 'onboard'
  | 'chat'
  | 'settings'
  | 'skills'
  | 'messaging'
  | 'webhooks'
  | 'artifacts'
  | 'cron'
  | 'profiles'
  | 'agents'
  | 'starmap'
  | 'command-center'
  | 'palette'
  | 'dialog'
  | 'terminal'
  | 'files'
  | 'hud'
  | 'quick'
  | 'extension'
  | 'unknown'

export type LocatorStrategy = 'role' | 'aria' | 'testid' | 'css' | 'xy'

export type ActionLocator =
  | {
      strategy: 'role'
      role: string
      name: string
      nth: number
      window: WindowKind
    }
  | {
      strategy: 'aria'
      name: string
      nth: number
      window: WindowKind
    }
  | {
      strategy: 'testid'
      testid: string
      nth: number
      window: WindowKind
    }
  | {
      strategy: 'css'
      css: string
      nth: number
      window: WindowKind
    }
  | {
      strategy: 'xy'
      x: number
      y: number
      window: WindowKind
    }

export type RecordedAction = RecordedActionBody & {
  outcome?: { ok: boolean }
}

type RecordedActionBody =
  | {
      type: 'click'
      t: number
      seedStep: number
      locator: ActionLocator
      point?: { x: number; y: number }
    }
  | {
      type: 'type'
      t: number
      seedStep: number
      locator: ActionLocator
      value: string
      point?: { x: number; y: number }
    }
  | {
      type: 'press'
      t: number
      seedStep: number
      key: string
      window: WindowKind
    }
  | {
      type: 'navigate'
      t: number
      seedStep: number
      hash: string
      window: WindowKind
    }
  | {
      type: 'resize'
      t: number
      seedStep: number
      width: number
      height: number
      window: WindowKind
    }
  | {
      type: 'contextmenu'
      t: number
      seedStep: number
      locator: ActionLocator
      point?: { x: number; y: number }
    }
  | {
      type: 'wait'
      t: number
      seedStep: number
      ms: number
    }

export type FailureClass =
  | 'process-exit'
  | 'pageerror'
  | 'crash'
  | 'hang'
  | 'error-boundary'
  | 'uncaught-main'
  | 'alert'
  | 'frozen-ui'
  | 'boot-timeout'
  | 'no-reply'
  | 'perf'

export type FailureSeverity = 'hard' | 'soft'

export type Failure = {
  class: FailureClass
  severity: FailureSeverity
  message: string
  stack?: string | undefined
  route?: string | undefined
  alertText?: string | undefined
}

export type TargetInfo = {
  remote: string
  branch: string
  sha: string
  dirty: boolean
  root: string
  desktopRoot: string
}

export type Widget = {
  locator: ActionLocator
  role: string
  name: string
  editable: boolean
  x: number
  y: number
}

export type UiSnapshot = {
  window: WindowKind
  url: string
  title: string
  route: string
  view: ModelView
  dialogTitle: string | null
  bootPhase: string
  bodyPreview: string
  widgets: Widget[]
  roleNames: string[]
}

export type StateId = string & { readonly __brand: 'StateId' }

export type FindingStatus = 'reproducible' | 'flaky' | 'new'

export type CoverageNode = {
  stateId: StateId
  visits: number
  actionsTried: string[]
  findings: number
}

export const HASH_ROUTES = [
  '/',
  '/settings',
  '/skills',
  '/messaging',
  '/webhooks',
  '/artifacts',
  '/cron',
  '/profiles',
  '/agents',
  '/starmap',
  '/command-center',
] as const

export const SETTINGS_HASHES = [
  '/settings?tab=config:model',
  '/settings?tab=config:chat',
  '/settings?tab=config:appearance',
  '/settings?tab=config:workspace',
  '/settings?tab=config:safety',
  '/settings?tab=config:browser',
  '/settings?tab=config:memory',
  '/settings?tab=config:voice',
  '/settings?tab=config:advanced',
  '/settings?tab=providers',
  '/settings?tab=gateway',
  '/settings?tab=keybinds',
  '/settings?tab=keys',
  '/settings?tab=notifications',
  '/settings?tab=billing',
  '/settings?tab=plugins',
  '/settings?tab=sessions',
  '/settings?tab=about',
] as const

export const SKILLS_HASHES = ['/skills?tab=skills', '/skills?tab=toolsets', '/skills?tab=mcp'] as const

export const PLUGIN_HASHES = ['/kanban'] as const

export const WARMUP_ROUTES = [...HASH_ROUTES, ...SETTINGS_HASHES, ...SKILLS_HASHES, ...PLUGIN_HASHES] as const

export const ACTIONABLE_ROLES = [
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'tab',
  'menuitem',
  'switch',
  'checkbox',
  'slider',
  'treeitem',
  'option',
  'spinbutton',
] as const
