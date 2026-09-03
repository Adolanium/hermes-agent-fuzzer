import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import * as fs from 'node:fs'
import { createSandbox, prepareProfileConfig, removeSandbox, sandboxLooksIsolated } from '../src/sandbox.ts'

describe('sandbox isolation', () => {
  it('creates a temp profile outside APPDATA Hermes', () => {
    const sandbox = createSandbox('test')
    expect(sandboxLooksIsolated(sandbox.hermesHome, sandbox.userDataDir)).toBe(true)
    expect(sandbox.hermesHome.startsWith(os.tmpdir()) || sandbox.root.includes('hermes-fuzz')).toBe(true)
    const appdata = process.env.APPDATA
    if (appdata) {
      expect(path.resolve(sandbox.userDataDir).toLowerCase().startsWith(path.join(appdata, 'Hermes').toLowerCase())).toBe(
        false,
      )
    }
    removeSandbox(sandbox)
  })

  it('seeds a mock provider for ui-only so onboarding does not block', () => {
    const sandbox = createSandbox('ui')
    prepareProfileConfig(sandbox, 'ui-only', 'http://127.0.0.1:9')
    const config = fs.readFileSync(`${sandbox.hermesHome}/config.yaml`, 'utf8')
    expect(config).toContain('provider: mock')
    expect(config).toContain('http://127.0.0.1:9')
    removeSandbox(sandbox)
  })

  it('writes a broken yaml mutant when asked', () => {
    const sandbox = createSandbox('mutant')
    prepareProfileConfig(sandbox, 'mock-backend', 'http://127.0.0.1:9', 'broken-yaml')
    const config = fs.readFileSync(`${sandbox.hermesHome}/config.yaml`, 'utf8')
    expect(config).toContain('this is not')
    removeSandbox(sandbox)
  })
})
