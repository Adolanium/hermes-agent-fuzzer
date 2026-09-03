import { describe, expect, it } from 'vitest'

import {
  electronBinaryName,
  electronDistCandidates,
  findPackagedBinary,
  packagedBinaryCandidates,
  packagedBinaryPath,
} from '../src/target/electron-binary.ts'

describe('electron paths', () => {
  it('uses electron.exe on Windows', () => {
    expect(electronBinaryName('win32')).toBe('electron.exe')
    expect(electronBinaryName('linux')).toBe('electron')
    expect(electronDistCandidates(['C:/repo'], 'win32')[0]).toContain('electron.exe')
  })

  it('points packaged windows builds at Hermes.exe', () => {
    const packed = packagedBinaryPath('C:/desktop', 'win32')
    expect(packed.replace(/\\/g, '/')).toContain('release/win-unpacked/Hermes.exe')
    expect(packagedBinaryCandidates('C:/desktop', 'win32').some((p) => p.includes('Hermes Agent.exe'))).toBe(true)
    expect(findPackagedBinary('C:/desktop-missing-release')).toBeNull()
  })
})
