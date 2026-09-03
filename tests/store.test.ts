import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/paths.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/paths.ts')>('../src/paths.ts')
  const dir = path.join(os.tmpdir(), `fuzz-store-${process.pid}`)
  fs.mkdirSync(dir, { recursive: true })
  return {
    ...actual,
    findingsDbPath: () => path.join(dir, 'findings.sqlite'),
    artifactsRoot: () => dir,
    ensureDir: (d: string) => fs.mkdirSync(d, { recursive: true }),
  }
})

import { listFindings, upsertFinding } from '../src/findings/store.ts'

describe('finding store', () => {
  afterEach(() => {
    const dir = path.join(os.tmpdir(), `fuzz-store-${process.pid}`)
    const db = path.join(dir, 'findings.sqlite')
    if (fs.existsSync(db)) {
      fs.rmSync(db)
    }
  })

  it('clusters the same fingerprint', () => {
    const failure = {
      class: 'hang' as const,
      severity: 'hard' as const,
      message: 'evaluate exceeded 20000ms',
      route: '/',
    }
    const first = upsertFinding({ failure, artifactDir: 'a', actionCount: 40, status: 'new' })
    const second = upsertFinding({ failure, artifactDir: 'b', actionCount: 8, status: 'reproducible' })
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.finding.hitCount).toBe(2)
    expect(second.finding.actionCount).toBe(8)
    expect(listFindings()).toHaveLength(1)
  })
})
