const DENIED_NAME_FRAGMENTS = [
  'send diagnostics',
  'check for updates',
  'install update',
  'oauth',
  'sign in',
  'sign in with',
  'connect provider',
  'connect with',
  'log in',
  'install plugin',
  'install from git',
  'install from url',
  'uninstall hermes',
  'reveal in folder',
  'reveal in file',
  'open folder',
  'open containing',
  'choose file',
  'browse…',
  'browse...',
  'open in browser',
  'open external',
] as const

const TERMINAL_NAME_FRAGMENTS = ['terminal', 'xterm', 'shell'] as const

export type DenyReason = 'outbound' | 'terminal-type' | 'file-picker'

export function normalizeControlName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function denyReason(name: string, action: 'click' | 'type', unsafeSurfaces: boolean): DenyReason | null {
  if (unsafeSurfaces) {
    return null
  }
  const normalized = normalizeControlName(name)
  if (DENIED_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return normalized.includes('folder') || normalized.includes('file') || normalized.includes('browse')
      ? 'file-picker'
      : 'outbound'
  }
  if (action === 'type' && TERMINAL_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return 'terminal-type'
  }
  return null
}

export function isDenied(name: string, action: 'click' | 'type', unsafeSurfaces: boolean): boolean {
  return denyReason(name, action, unsafeSurfaces) !== null
}
