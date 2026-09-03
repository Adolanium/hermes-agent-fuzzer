import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'

export function electronBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'electron.exe' : 'electron'
}

export function electronDistCandidates(roots: string[], platform: NodeJS.Platform = process.platform): string[] {
  return roots.map((root) => path.join(root, 'node_modules', 'electron', 'dist', electronBinaryName(platform)))
}

function packagePath(from: string): string | null {
  try {
    const resolved = createRequire(path.join(from, 'package.json'))('electron')
    return typeof resolved === 'string' && resolved ? resolved : null
  } catch {
    return null
  }
}

export function resolveElectronBinary(roots: string[]): string {
  for (const root of roots) {
    const declared = packagePath(root)
    if (declared && fs.existsSync(declared)) {
      return declared
    }
  }
  for (const candidate of electronDistCandidates(roots)) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['electron'], { encoding: 'utf8' })
  if (lookup.status === 0 && lookup.stdout.trim()) {
    const first = lookup.stdout.trim().split(/\r?\n/)[0]
    if (first && fs.existsSync(first)) {
      return first
    }
  }
  throw new Error(`Electron binary not found. Searched ${electronDistCandidates(roots).join(', ')}`)
}

export function packagedBinaryCandidates(desktopRoot: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') {
    return [
      path.join(desktopRoot, 'release', 'win-unpacked', 'Hermes.exe'),
      path.join(desktopRoot, 'release', 'win-unpacked', 'Hermes Agent.exe'),
      path.join(desktopRoot, 'out', 'win-unpacked', 'Hermes.exe'),
      path.join(desktopRoot, 'out', 'hermes-win32-x64', 'Hermes.exe'),
    ]
  }
  if (platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    return [
      path.join(desktopRoot, 'release', `mac-${arch}`, 'Hermes.app', 'Contents', 'MacOS', 'Hermes'),
      path.join(desktopRoot, 'release', 'mac', 'Hermes.app', 'Contents', 'MacOS', 'Hermes'),
    ]
  }
  return [
    path.join(desktopRoot, 'release', 'linux-unpacked', 'hermes'),
    path.join(desktopRoot, 'out', 'linux-unpacked', 'hermes'),
  ]
}

export function packagedBinaryPath(desktopRoot: string, platform: NodeJS.Platform = process.platform): string {
  return packagedBinaryCandidates(desktopRoot, platform)[0] ?? path.join(desktopRoot, 'release', 'hermes')
}

export function findPackagedBinary(desktopRoot: string, platform: NodeJS.Platform = process.platform): string | null {
  for (const candidate of packagedBinaryCandidates(desktopRoot, platform)) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
