import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { writeReproMarkdown } from './repro.ts'
import { fingerprintOf } from '../findings/fingerprint.ts'
import { fuzzerVersion, findingsRoot, ensureDir } from '../paths.ts'
import { readActions, writeActions } from '../record/actions.ts'
import type { FuzzerConfig } from '../config.ts'
import type { ConfigMutant } from '../explorer/surfaces.ts'
import type { Failure, LaunchProfile, RecordedAction, TargetInfo, UiSnapshot } from '../types.ts'

export type Artifact = {
  dir: string
  id: string
}

export function writeFindingArtifact(input: {
  target: TargetInfo
  profile: LaunchProfile
  mutant: ConfigMutant
  seed: number
  actions: RecordedAction[]
  failure: Failure
  snapshots: UiSnapshot[]
  stdout: string
  stderr: string
  desktopLog: string
  agentLog: string
  pageErrors: string[]
  screenshots: Buffer[]
  hermesHome?: string
  windows?: import('../types.ts').WindowKind[]
  campaign?: FuzzerConfig['campaign']
  unsafeSurfaces?: boolean
}): Artifact {
  const id = fingerprintOf(input.failure).slice(0, 12)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(findingsRoot(), `${stamp}-${id}`)
  ensureDir(dir)

  const manifest = {
    schemaVersion: 1,
    windows: input.windows,
    campaign: input.campaign,
    unsafeSurfaces: input.unsafeSurfaces ?? false,
    id,
    sha: input.target.sha,
    remote: input.target.remote,
    branch: input.target.branch,
    dirty: input.target.dirty,
    date: new Date().toISOString(),
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    node: process.version,
    fuzzerVersion: fuzzerVersion(),
    seed: input.seed,
    profile: input.profile,
    mutant: input.mutant,
    failure: input.failure,
    timing: {
      actions: input.actions.length,
      started: input.actions[0]?.t ?? Date.now(),
      ended: Date.now(),
    },
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  writeActions(path.join(dir, 'actions.json'), input.actions)
  fs.writeFileSync(path.join(dir, 'seed.txt'), String(input.seed), 'utf8')
  fs.writeFileSync(
    path.join(dir, 'repro.md'),
    writeReproMarkdown({
      target: input.target,
      profile: input.profile,
      mutant: input.mutant,
      seed: input.seed,
      actions: input.actions,
      failure: input.failure,
      fuzzerVersion: fuzzerVersion(),
    }),
    'utf8',
  )
  fs.writeFileSync(path.join(dir, 'stdout.log'), input.stdout, 'utf8')
  fs.writeFileSync(path.join(dir, 'stderr.log'), input.stderr, 'utf8')
  fs.writeFileSync(path.join(dir, 'desktop.log'), input.desktopLog, 'utf8')
  fs.writeFileSync(path.join(dir, 'agent.log'), input.agentLog, 'utf8')
  fs.writeFileSync(path.join(dir, 'pageerror.log'), input.pageErrors.join('\n\n'), 'utf8')
  const last = input.snapshots[input.snapshots.length - 1]
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify(
      {
        route: last?.route,
        title: last?.title,
        url: last?.url,
        view: last?.view,
        bootPhase: last?.bootPhase,
        roleNames: last?.roleNames,
      },
      null,
      2,
    ),
    'utf8',
  )
  input.screenshots.forEach((buf, i) => {
    fs.writeFileSync(path.join(dir, `shot-${i + 1}.png`), buf)
  })
  if (input.hermesHome) {
    const configSrc = path.join(input.hermesHome, 'config.yaml')
    if (fs.existsSync(configSrc)) {
      fs.copyFileSync(configSrc, path.join(dir, 'config.yaml'))
    }
  }
  return { dir, id }
}

export function writeMinimizedActions(dir: string, actions: RecordedAction[], verified = true): void {
  const file = path.join(dir, verified ? 'actions.min.json' : 'actions.candidate.json')
  if (verified && fs.existsSync(file) && readActions(file).length < actions.length) return
  writeActions(file, actions)
}
