import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ episode: vi.fn(), target: vi.fn(), build: vi.fn() }))
vi.mock('../src/campaign/episode.ts', () => ({ runEpisode: mocks.episode }))
vi.mock('../src/target/checkout.ts', () => ({ ensureTarget: mocks.target }))
vi.mock('../src/target/build.ts', () => ({ ensureBuilt: mocks.build }))
vi.mock('../src/findings/store.ts', () => ({ deleteInternalFindings: () => 0 }))
vi.mock('../src/campaign/inbox.ts', () => ({ writeInbox: () => '' }))
vi.mock('../src/explorer/coverage.ts', () => ({ loadGraph: () => ({}), saveGraph: () => {}, coverageSummary: () => ({ states: 0 }) }))
vi.mock('../src/paths.ts', async () => ({
  ...await vi.importActual('../src/paths.ts'), artifactsRoot: () => path.join(os.tmpdir(), `fuzz-campaign-${process.pid}`),
}))
import { runCampaign, type RunOptions } from '../src/campaign/run.ts'
import { loadConfig } from '../src/config.ts'

const dir = path.join(os.tmpdir(), `fuzz-campaign-${process.pid}`)
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
const options: RunOptions = { config: loadConfig(path.join(dir, 'absent.json')), profile: 'ui-only', durationMs: null,
  actions: 1, seed: 1, skipFetch: true, skipBuild: true, unsafeSurfaces: false, extraWindows: [],
  collectV8: false, keepSandbox: false, reduce: false, workers: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.target.mockReturnValue({ sha: 'abc', root: dir, desktopRoot: dir })
  mocks.episode.mockResolvedValue({ seed: 1, actionCount: 1, successfulActions: 1, failures: [], artifactDir: null })
})

describe('campaign result contract', () => {
  it.each([1, null])('runs one episode without a duration, with seed %s', async (seed) => {
    const result = await runCampaign({ ...options, seed })
    expect(result).toMatchObject({ status: 'healthy', exitCode: 0, episodes: 1, actions: 1 })
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'campaign-result.json'), 'utf8'))).toEqual(result)
  })
  it('counts all episodes and actions until the duration expires', async () => {
    let now = 1000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.episode.mockImplementation(async () => {
      now += 10
      return { seed: 1, actionCount: 2, successfulActions: 1, failures: [], artifactDir: null }
    })
    try {
      const result = await runCampaign({ ...options, durationMs: 25 })
      expect(result).toMatchObject({ status: 'healthy', episodes: 3, actions: 6, successfulActions: 3 })
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'campaign-result.json'), 'utf8'))).toEqual(result)
    } finally {
      clock.mockRestore()
    }
  })
  it('fails on hard findings but allows soft findings', async () => {
    mocks.episode.mockResolvedValueOnce({ seed: 1, actionCount: 1, successfulActions: 1, failures: [{ severity: 'hard', class: 'crash' }] })
    expect(await runCampaign(options)).toMatchObject({ status: 'hard-findings', exitCode: 2, hardFindings: 1 })
    mocks.episode.mockResolvedValueOnce({ seed: 1, actionCount: 1, successfulActions: 1, failures: [{ severity: 'soft', class: 'alert' }] })
    expect(await runCampaign(options)).toMatchObject({ status: 'healthy', exitCode: 0, softFindings: 1 })
  })
  it('writes a setup error instead of an empty successful run', async () => {
    mocks.target.mockImplementationOnce(() => { throw new Error('Target checkout missing') })
    expect(await runCampaign(options)).toMatchObject({ status: 'runner-error', exitCode: 1, episodes: 0, error: 'Target checkout missing' })
    expect(mocks.episode).not.toHaveBeenCalled()
  })
  it('distinguishes driver exceptions from app failures', async () => {
    mocks.episode.mockRejectedValueOnce(new Error('driver broke'))
    expect(await runCampaign(options)).toMatchObject({ status: 'runner-error', exitCode: 1, hardFindings: 0 })
  })
  it('rejects a run that completed no UI actions', async () => {
    mocks.episode.mockResolvedValueOnce({ seed: 1, actionCount: 1, successfulActions: 0, failures: [] })
    expect(await runCampaign(options)).toMatchObject({ status: 'runner-error', exitCode: 1, error: 'No UI action completed' })
  })
})
