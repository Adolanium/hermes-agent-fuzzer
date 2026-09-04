import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ replay: vi.fn(), record: vi.fn() }))
vi.mock('../src/campaign/episode.ts', () => ({ replayActionsOnFreshApp: mocks.replay }))
vi.mock('../src/findings/store.ts', () => ({ recordReplayAttempt: mocks.record }))
import { replayArtifact } from '../src/record/replay.ts'
import { loadConfig } from '../src/config.ts'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-replay-artifact-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
const failure = { class: 'crash', severity: 'hard', message: 'injected crash' }
const manifest = { sha: 'a'.repeat(40), remote: 'target', seed: 1, profile: 'no-provider', mutant: 'sane',
  windows: ['hud'], campaign: { bootMs: 1000, hangMs: 100, replayTimeoutMs: 50 }, failure }
const config = loadConfig(path.join(dir, 'absent.json'))
const options = { artifactDir: dir, config, target: { sha: manifest.sha, remote: 'target', branch: 'main', root: dir,
  desktopRoot: dir, dirty: false }, minimized: false, allowDrift: false, unsafeSurfaces: false }

beforeEach(() => {
  vi.clearAllMocks()
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, 'actions.json'), '[]')
  mocks.replay.mockResolvedValue({ status: 'matched', step: 0, reproduced: [failure] })
})

describe('artifact replay', () => {
  it('restores execution conditions and records the structured result', async () => {
    expect((await replayArtifact(options)).status).toBe('matched')
    expect(mocks.replay).toHaveBeenCalledWith(expect.objectContaining({ profile: 'no-provider', windows: ['hud'], expected: failure,
      config: expect.objectContaining({ campaign: expect.objectContaining(manifest.campaign) }) }))
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ allowPromotion: true, actionCount: 0 }))
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'replay-result.json'), 'utf8')).status).toBe('matched')
  })
  it('does not turn a different failure into success', async () => {
    mocks.replay.mockResolvedValue({ status: 'different-failure', step: 1, reproduced: [{ ...failure, message: 'unrelated' }] })
    expect((await replayArtifact(options)).status).toBe('different-failure')
  })
  it('rejects drift unless explicitly requested and never promotes drift evidence', async () => {
    const drifted = { ...options, target: { ...options.target, sha: 'b'.repeat(40) } }
    await expect(replayArtifact(drifted)).rejects.toThrow('recorded SHA')
    await replayArtifact({ ...drifted, allowDrift: true })
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ allowPromotion: false }))
  })
  it('rejects corrupt actions before launching the app', async () => {
    fs.writeFileSync(path.join(dir, 'actions.json'), '[{}]')
    await expect(replayArtifact(options)).rejects.toThrow('step 1')
    expect(mocks.replay).not.toHaveBeenCalled()
  })
})
