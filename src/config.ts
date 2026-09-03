import * as fs from 'node:fs'
import * as path from 'node:path'

import { fuzzerRoot } from './paths.ts'
import type { LaunchProfile } from './types.ts'

export type FuzzerConfig = {
  target: {
    remote: string
    branch: string
    dir: string
    cloneReference: string | null
  }
  campaign: {
    defaultActions: number
    workers: number
    hangMs: number
    bootMs: number
    actionTimeoutMs: number
    replayTimeoutMs: number
    screenshotEvery: number
    perfWarnMs: number
    reduceBudgetMs: number
    reduceMaxReplays: number
    fetchIntervalMs: number
    screenshotDepth: number
  }
}

const DEFAULT_CONFIG: FuzzerConfig = {
  target: {
    remote: 'https://github.com/NousResearch/hermes-agent.git',
    branch: 'main',
    dir: '_targets/hermes-agent',
    cloneReference: null,
  },
  campaign: {
    defaultActions: 50,
    workers: 1,
    hangMs: 20_000,
    bootMs: 180_000,
    actionTimeoutMs: 800,
    replayTimeoutMs: 4_000,
    screenshotEvery: 5,
    perfWarnMs: 5_000,
    reduceBudgetMs: 900_000,
    reduceMaxReplays: 40,
    fetchIntervalMs: 3_600_000,
    screenshotDepth: 3,
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function loadConfig(configPath = path.join(fuzzerRoot(), 'fuzzer.config.json')): FuzzerConfig {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  const raw = fs.readFileSync(configPath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  const root = asRecord(parsed)
  const target = asRecord(root.target)
  const campaign = asRecord(root.campaign)
  const cloneReference = target.cloneReference
  return {
    target: {
      remote: readString(target, 'remote', DEFAULT_CONFIG.target.remote),
      branch: readString(target, 'branch', DEFAULT_CONFIG.target.branch),
      dir: readString(target, 'dir', DEFAULT_CONFIG.target.dir),
      cloneReference: typeof cloneReference === 'string' && cloneReference.length > 0 ? cloneReference : null,
    },
    campaign: {
      defaultActions: readNumber(campaign, 'defaultActions', DEFAULT_CONFIG.campaign.defaultActions),
      workers: readNumber(campaign, 'workers', DEFAULT_CONFIG.campaign.workers),
      hangMs: readNumber(campaign, 'hangMs', DEFAULT_CONFIG.campaign.hangMs),
      bootMs: readNumber(campaign, 'bootMs', DEFAULT_CONFIG.campaign.bootMs),
      actionTimeoutMs: readNumber(campaign, 'actionTimeoutMs', DEFAULT_CONFIG.campaign.actionTimeoutMs),
      replayTimeoutMs: readNumber(campaign, 'replayTimeoutMs', DEFAULT_CONFIG.campaign.replayTimeoutMs),
      screenshotEvery: readNumber(campaign, 'screenshotEvery', DEFAULT_CONFIG.campaign.screenshotEvery),
      perfWarnMs: readNumber(campaign, 'perfWarnMs', DEFAULT_CONFIG.campaign.perfWarnMs),
      reduceBudgetMs: readNumber(campaign, 'reduceBudgetMs', DEFAULT_CONFIG.campaign.reduceBudgetMs),
      reduceMaxReplays: readNumber(campaign, 'reduceMaxReplays', DEFAULT_CONFIG.campaign.reduceMaxReplays),
      fetchIntervalMs: readNumber(campaign, 'fetchIntervalMs', DEFAULT_CONFIG.campaign.fetchIntervalMs),
      screenshotDepth: readNumber(campaign, 'screenshotDepth', DEFAULT_CONFIG.campaign.screenshotDepth),
    },
  }
}

export function resolveTargetDir(config: FuzzerConfig): string {
  return path.isAbsolute(config.target.dir) ? config.target.dir : path.join(fuzzerRoot(), config.target.dir)
}

export function isLaunchProfile(value: string): value is LaunchProfile {
  return (
    value === 'mock-backend' ||
    value === 'ui-only' ||
    value === 'no-provider' ||
    value === 'packaged' ||
    value === 'all'
  )
}
