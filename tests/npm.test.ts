import * as os from 'node:os'
import { describe, expect, it } from 'vitest'

import { npmCliPath, npmEngineBlocked, npmInvocation, quoteWinArg, readNpmVersion, uvExecutable } from '../src/target/npm.ts'

describe('npm helpers', () => {
  it('runs npm through node npm-cli.js when that file exists', () => {
    const npm = npmInvocation()
    expect(npm.command).toBe(process.execPath)
    expect(npm.prefix[0]).toBe(npmCliPath())
    expect(uvExecutable('win32')).toBe('uv.exe')
  })

  it('can read the host npm version', () => {
    const version = readNpmVersion(os.tmpdir())
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('flags the Hermes-blocked npm 11.10-11.16 range', () => {
    expect(npmEngineBlocked('11.16.0')).toBe(true)
    expect(npmEngineBlocked('11.10.0')).toBe(true)
    expect(npmEngineBlocked('11.9.2')).toBe(false)
    expect(npmEngineBlocked('11.17.0')).toBe(false)
    expect(npmEngineBlocked('10.9.3')).toBe(false)
  })

  it('quotes windows args that contain spaces', () => {
    expect(quoteWinArg('--engine-strict=false')).toBe('--engine-strict=false')
    expect(quoteWinArg('C:\\Program Files\\npm')).toBe('"C:\\Program Files\\npm"')
  })
})
