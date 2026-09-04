import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { artifactsRoot, ensureDir } from '../paths.ts'
import { logInfo, logWarn } from '../log.ts'
import type { TargetInfo } from '../types.ts'
import { commandExists, npmEngineBlocked, readNpmVersion, runNpm, runTool, uvExecutable } from './npm.ts'

type BuildStamp = {
  sha: string
  node: string
  lockHash: string
}

function stampPath(): string {
  return path.join(artifactsRoot(), 'build-stamp.json')
}

function lockHash(root: string): string {
  const lock = path.join(root, 'package-lock.json')
  if (!fs.existsSync(lock)) {
    return 'missing-lock'
  }
  return crypto.createHash('sha256').update(fs.readFileSync(lock)).digest('hex')
}

function readStamp(): BuildStamp | null {
  const file = stampPath()
  if (!fs.existsSync(file)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (typeof record.sha !== 'string' || typeof record.node !== 'string' || typeof record.lockHash !== 'string') {
      return null
    }
    return { sha: record.sha, node: record.node, lockHash: record.lockHash }
  } catch {
    return null
  }
}

function writeStamp(stamp: BuildStamp): void {
  ensureDir(artifactsRoot())
  fs.writeFileSync(stampPath(), JSON.stringify(stamp, null, 2), 'utf8')
}

function distReady(desktopRoot: string): boolean {
  return (
    fs.existsSync(path.join(desktopRoot, 'dist', 'electron-main.mjs')) &&
    fs.existsSync(path.join(desktopRoot, 'dist', 'index.html'))
  )
}

export function ensureBuilt(target: TargetInfo, skipBuild: boolean, requireMatchingBuild = false): void {
  const current: BuildStamp = {
    sha: target.sha,
    node: process.version,
    lockHash: lockHash(target.root),
  }
  const previous = readStamp()
  const same =
    previous !== null &&
    previous.sha === current.sha &&
    previous.node === current.node &&
    previous.lockHash === current.lockHash &&
    distReady(target.desktopRoot)

  if (same) {
    logInfo('desktop build is current, skipping', { sha: target.sha })
    return
  }
  if (skipBuild) {
    if (requireMatchingBuild && !same) throw new Error('Recorded target has no matching build stamp. Run without --skip-build.')
    if (!distReady(target.desktopRoot)) {
      throw new Error(`Desktop dist missing at ${target.desktopRoot}/dist. Run prepare without --skip-build.`)
    }
    logInfo('skip-build set, using existing dist', { sha: target.sha })
    return
  }

  const npmVersion = readNpmVersion(target.root)
  if (npmEngineBlocked(npmVersion)) {
    logWarn('host npm is in Hermes excluded range 11.10-11.16, installing with engine-strict off', {
      npm: npmVersion,
      node: process.version,
    })
  }
  logInfo('installing target npm deps', { root: target.root, npm: npmVersion, node: process.version })
  runNpm(target.root, ['ci', '--engine-strict=false'], { npm_config_engine_strict: 'false' })
  if (commandExists('uv') || commandExists(uvExecutable())) {
    logInfo('syncing python deps', { root: target.root })
    runTool(target.root, commandExists(uvExecutable()) ? uvExecutable() : 'uv', ['sync'])
  }
  logInfo('building desktop', { desktopRoot: target.desktopRoot })
  runNpm(target.desktopRoot, ['run', 'build'], { npm_config_engine_strict: 'false' })
  if (!distReady(target.desktopRoot)) {
    throw new Error('Desktop build finished but dist files are missing')
  }
  writeStamp(current)
}
