import * as fs from 'node:fs'
import * as path from 'node:path'

import type { FuzzerConfig } from '../config.ts'
import { resolveTargetDir } from '../config.ts'
import { logInfo } from '../log.ts'
import type { TargetInfo } from '../types.ts'
import { git, gitOk } from './git.ts'

function runClone(config: FuzzerConfig, targetDir: string): void {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  const args = ['clone', '--origin', 'origin', config.target.remote, targetDir]
  const reference = config.target.cloneReference
  if (reference && fs.existsSync(path.join(reference, '.git'))) {
    args.splice(1, 0, '--reference', reference, '--dissociate')
    logInfo('cloning target with local object cache', { reference, dest: targetDir })
  } else {
    logInfo('cloning target', { remote: config.target.remote, dest: targetDir })
  }
  git(process.cwd(), args)
}

function ignoredDirty(line: string): boolean {
  const file = line.replace(/^.. /, '').replace(/\\/g, '/')
  return (
    file.startsWith('apps/desktop/dist/') ||
    file.startsWith('apps/desktop/release/') ||
    file.includes('/node_modules/') ||
    file.endsWith('node_modules')
  )
}

function isDirty(root: string): boolean {
  const status = git(root, ['status', '--porcelain'])
  if (!status) {
    return false
  }
  return status.split(/\r?\n/).some((line) => line && !ignoredDirty(line))
}

export function ensureTarget(config: FuzzerConfig, skipFetch: boolean, revision?: string): TargetInfo {
  if (revision && !/^[a-f0-9]{40}$/i.test(revision)) throw new Error('Expected a full commit SHA')
  const root = resolveTargetDir(config)
  if (!fs.existsSync(path.join(root, '.git'))) {
    if (skipFetch) {
      throw new Error(`Target checkout missing at ${root}. Run prepare first.`)
    }
    runClone(config, root)
  }

  if (!skipFetch) {
    const current = gitOk(root, ['remote', 'get-url', 'origin']) ? git(root, ['remote', 'get-url', 'origin']) : ''
    if (current !== config.target.remote) {
      git(root, ['remote', 'set-url', 'origin', config.target.remote])
    }
    logInfo('fetching target', { remote: config.target.remote, branch: config.target.branch })
    git(root, ['fetch', 'origin', config.target.branch])
  }

  if (!skipFetch || revision) {
    if (isDirty(root)) throw new Error(`Target checkout is dirty: ${root}`)
    if (revision && !gitOk(root, ['cat-file', '-e', `${revision}^{commit}`])) {
      if (skipFetch) throw new Error(`Recorded commit unavailable locally: ${revision}`)
      git(root, ['fetch', 'origin', revision])
    }
    git(root, ['checkout', '--detach', revision ?? `origin/${config.target.branch}`])
  }

  const sha = git(root, ['rev-parse', 'HEAD'])
  const dirty = isDirty(root)
  return {
    remote: config.target.remote,
    branch: config.target.branch,
    sha,
    dirty,
    root,
    desktopRoot: path.join(root, 'apps', 'desktop'),
  }
}
