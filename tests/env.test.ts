import { describe, expect, it } from 'vitest'

import { isCredentialEnvVar, stripCredentials } from '../src/safety/env.ts'

describe('stripCredentials', () => {
  it('drops API keys and tokens', () => {
    const clean = stripCredentials({
      PATH: 'C:\\Windows',
      OPENAI_API_KEY: 'sk-secret',
      HERMES_HOME: 'C:\\Users\\me\\AppData\\Local\\hermes',
      HERMES_DESKTOP_DEV_SERVER: 'http://127.0.0.1:5174',
      DISPLAY: ':0',
    })
    expect(clean.PATH).toBe('C:\\Windows')
    expect(clean.DISPLAY).toBe(':0')
    expect(clean.OPENAI_API_KEY).toBeUndefined()
    expect(clean.HERMES_HOME).toBeUndefined()
    expect(clean.HERMES_DESKTOP_DEV_SERVER).toBeUndefined()
  })

  it('recognizes known credential names', () => {
    expect(isCredentialEnvVar('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isCredentialEnvVar('PATH')).toBe(false)
  })
})
