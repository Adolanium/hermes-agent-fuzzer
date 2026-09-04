import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { readManifest } from '../src/record/manifest.ts'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-manifest-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
afterEach(() => fs.rmSync(path.join(dir, 'manifest.json'), { force: true }))
const base = { sha: 'a'.repeat(40), remote: 'target', profile: 'ui-only', seed: 1,
  failure: { class: 'crash', severity: 'hard', message: 'renderer crash' } }
const read = (overrides = {}) => {
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...base, ...overrides }))
  return readManifest(dir)
}

describe('artifact manifest', () => {
  it('accepts legacy manifests and restores versioned execution conditions', () => {
    expect(read().sha).toBe(base.sha)
    expect(read({ schemaVersion: 1, windows: ['hud'], campaign: { bootMs: 100, hangMs: 20, replayTimeoutMs: 10 } }).windows).toEqual(['hud'])
  })
  it.each([{ sha: '--bad' }, { schemaVersion: 2 }, { failure: {} }, { profile: 'all' }, { windows: ['invalid'] },
    { mutant: 'typo' }, { campaign: { bootMs: -1 } }, { seed: 1.2 }])('rejects malformed metadata %j', (invalid) => {
    expect(() => read(invalid)).toThrow()
  })
})
