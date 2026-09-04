#!/usr/bin/env node
import * as path from 'node:path'

import { writeInbox } from './campaign/inbox.ts'
import { parseDuration, parseWindowsFlag, prepareTarget, runCampaign } from './campaign/run.ts'
import { isLaunchProfile, loadConfig } from './config.ts'
import { readManifest } from './record/manifest.ts'
import { logError, logInfo } from './log.ts'
import { replayArtifact } from './record/replay.ts'
import { readActions } from './record/actions.ts'
import { writeMinimizedActions } from './artifacts/write.ts'
import type { LaunchProfile } from './types.ts'
import { cheapCuts, ddmin } from './reduce/ddmin.ts'
import { fuzzerVersion } from './paths.ts'

type Args = {
  command: string
  flags: Record<string, string | boolean>
  rest: string[]
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...tail] = argv
  const flags: Record<string, string | boolean> = {}
  const rest: string[] = []
  for (let i = 0; i < tail.length; i += 1) {
    const token = tail[i]
    if (!token) {
      continue
    }
    if (token.startsWith('--')) {
      const body = token.slice(2)
      const eq = body.indexOf('=')
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
        continue
      }
      const next = tail[i + 1]
      if (next && !next.startsWith('--')) {
        flags[body] = next
        i += 1
      } else {
        flags[body] = true
      }
    } else {
      rest.push(token)
    }
  }
  return { command, flags, rest }
}

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || flags[name] === 'true' || flags[name] === '1'
}

function help(): void {
  process.stdout.write(`hermes-agent-fuzzer ${fuzzerVersion()}

  prepare                 Fetch latest main and build Desktop
  run                     Run one episode, or a timed campaign
  replay <dir>            Replay a finding artifact
  inbox                   Print clustered findings (drops fuzzer-internal noise)
  reduce <dir>            Re-minimize an existing artifact

Options
  --profile mock-backend|ui-only|no-provider|packaged|all
  --duration 8h
  --actions 50
  --seed 123
  --skip-fetch
  --skip-build
  --unsafe-surfaces
  --windows main|hud,quick|all
  --coverage
  --keep-sandbox
  --no-reduce
  --minimized
  --allow-drift
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  const profileRaw = flagString(args.flags, 'profile') ?? 'mock-backend'
  if (!isLaunchProfile(profileRaw)) {
    throw new Error(`Unknown profile: ${profileRaw}`)
  }
  const profile: LaunchProfile = profileRaw

  if (args.command === 'help' || args.command === '--help' || args.command === '-h') {
    help()
    return
  }

  if (args.command === 'inbox') {
    process.stdout.write(writeInbox())
    return
  }

  if (args.command === 'prepare') {
    const target = await prepareTarget(config, flagBool(args.flags, 'skip-fetch'), flagBool(args.flags, 'skip-build'))
    logInfo('target ready', { sha: target.sha, root: target.root })
    return
  }

  if (args.command === 'run') {
    const durationRaw = flagString(args.flags, 'duration')
    const result = await runCampaign({
      config,
      profile,
      durationMs: durationRaw ? parseDuration(durationRaw) : null,
      actions: Number(flagString(args.flags, 'actions') ?? config.campaign.defaultActions),
      seed: flagString(args.flags, 'seed') ? Number(flagString(args.flags, 'seed')) : null,
      skipFetch: flagBool(args.flags, 'skip-fetch'),
      skipBuild: flagBool(args.flags, 'skip-build'),
      unsafeSurfaces: flagBool(args.flags, 'unsafe-surfaces'),
      extraWindows: flagString(args.flags, 'windows') === undefined ? null : parseWindowsFlag(flagString(args.flags, 'windows')),
      collectV8: flagBool(args.flags, 'coverage'),
      keepSandbox: flagBool(args.flags, 'keep-sandbox'),
      reduce: !flagBool(args.flags, 'no-reduce'),
      workers: 1,
    })
    process.exitCode = result.exitCode
    return
  }

  if (args.command === 'replay') {
    const dir = args.rest[0]
    if (!dir) {
      throw new Error('replay requires an artifact directory')
    }
    const manifest = readManifest(path.resolve(dir))
    if (manifest.remote !== config.target.remote) throw new Error('Artifact remote does not match configured target')
    readActions(path.join(path.resolve(dir), flagBool(args.flags, 'minimized') ? 'actions.min.json' : 'actions.json'))
    const target = await prepareTarget(config, flagBool(args.flags, 'skip-fetch'), flagBool(args.flags, 'skip-build'),
      flagBool(args.flags, 'allow-drift') ? undefined : manifest.sha)
    const result = await replayArtifact({
      config,
      target,
      artifactDir: path.resolve(dir),
      minimized: flagBool(args.flags, 'minimized'),
      allowDrift: flagBool(args.flags, 'allow-drift'),
      unsafeSurfaces: flagBool(args.flags, 'unsafe-surfaces'),
    })
    process.exitCode = result.status === 'matched' ? 0 : result.status === 'runner-error' || result.status === 'diverged' ? 1 : 2
    return
  }

  if (args.command === 'reduce') {
    const dir = args.rest[0]
    if (!dir) {
      throw new Error('reduce requires an artifact directory')
    }
    const artifactDir = path.resolve(dir)
    const manifest = readManifest(artifactDir)
    if (manifest.remote !== config.target.remote) throw new Error('Artifact remote does not match configured target')
    const actions = readActions(path.join(artifactDir, 'actions.json'))
    const target = await prepareTarget(config, flagBool(args.flags, 'skip-fetch'), flagBool(args.flags, 'skip-build'),
      flagBool(args.flags, 'allow-drift') ? undefined : manifest.sha)
    const replayOptions = { config, target, artifactDir, minimized: false,
      allowDrift: flagBool(args.flags, 'allow-drift'), unsafeSurfaces: flagBool(args.flags, 'unsafe-surfaces') }
    const started = Date.now()
    let replays = 0
    const pred = async (subset: typeof actions) => {
      if (Date.now() - started > config.campaign.reduceBudgetMs || replays >= config.campaign.reduceMaxReplays) {
        return false
      }
      replays += 1
      const result = await replayArtifact(replayOptions, subset, false)
      if (result.status === 'runner-error') throw new Error(result.message)
      return result.status === 'matched'
    }
    const original = await replayArtifact(replayOptions, actions)
    replays += 1
    if (original.status !== 'matched') {
      logError('original sequence did not reproduce')
      process.exitCode = original.status === 'runner-error' || original.status === 'diverged' ? 1 : 2
      return
    }
    let best = actions
    for (const cut of cheapCuts(actions)) {
      if (await pred(cut)) {
        best = cut
        break
      }
    }
    best = await ddmin(best, pred)
    // A final confirmation is outside the search budget and verifies the saved candidate.
    const confirmed = await replayArtifact(replayOptions, best)
    if (confirmed.status !== 'matched') {
      process.exitCode = confirmed.status === 'runner-error' || confirmed.status === 'diverged' ? 1 : 2
      return
    }
    writeMinimizedActions(artifactDir, best, target.sha === manifest.sha)
    logInfo('reduction complete', { count: best.length, dir, verifiedAtRecordedSha: target.sha === manifest.sha })
    return
  }

  help()
  process.exitCode = 1
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  logError(message)
  process.exitCode = 1
})
