import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureTarget } from '../src/target/checkout.ts'
import { loadConfig } from '../src/config.ts'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-checkout-'))
const remote = path.join(dir, 'remote')
const target = path.join(dir, 'target')
fs.mkdirSync(remote)
const git = (args: string[], cwd = remote) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
git(['init', '-b', 'main'])
git(['config', 'user.email', 'fixture@example.invalid'])
git(['config', 'user.name', 'Fixture'])
fs.writeFileSync(path.join(remote, 'version.txt'), 'old')
git(['add', '.']); git(['commit', '-m', 'old'])
const oldSha = git(['rev-parse', 'HEAD'])
fs.writeFileSync(path.join(remote, 'version.txt'), 'new')
git(['commit', '-am', 'new'])
const newSha = git(['rev-parse', 'HEAD'])
const config = loadConfig(path.join(dir, 'absent.json'))
config.target = { remote, branch: 'main', dir: target, cloneReference: null }
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('recorded target checkout', () => {
  it('checks out the recorded commit even after main advances', () => {
    expect(ensureTarget(config, false, oldSha).sha).toBe(oldSha)
    expect(fs.readFileSync(path.join(target, 'version.txt'), 'utf8')).toBe('old')
    expect(ensureTarget(config, false).sha).toBe(newSha)
    expect(ensureTarget(config, true, oldSha).sha).toBe(oldSha)
  })
  it('refuses to overwrite a dirty target', () => {
    fs.writeFileSync(path.join(target, 'version.txt'), 'operator edit')
    expect(() => ensureTarget(config, true, newSha)).toThrow('dirty')
    expect(fs.readFileSync(path.join(target, 'version.txt'), 'utf8')).toBe('operator edit')
  })
  it('rejects revision arguments that are not full SHAs', () => {
    expect(() => ensureTarget(config, false, '--bad')).toThrow('full commit SHA')
  })
})
