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

import Database from 'better-sqlite3'
import { listFindings, upsertFinding, recordReplayAttempt } from '../src/findings/store.ts'

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

  it('keeps verified evidence when a shorter unverified duplicate arrives', () => {
    const failure = { class: 'crash' as const, severity: 'hard' as const, message: 'renderer crash' }
    upsertFinding({ failure, artifactDir: 'verified', actionCount: 8, status: 'new' })
    const attempt = { failure, artifactDir: 'verified', actionCount: 4, sequenceHash: 'min', targetSha: 'abc',
      result: { status: 'matched' as const, step: 4, reproduced: [failure] } }
    recordReplayAttempt(attempt)
    recordReplayAttempt(attempt)
    recordReplayAttempt({ ...attempt, result: { status: 'not-reproduced', step: 4, reproduced: [] } })
    recordReplayAttempt({ ...attempt, targetSha: 'new-sha', allowPromotion: false })
    upsertFinding({ failure, artifactDir: 'candidate', actionCount: 1, status: 'new' })
    expect(listFindings()[0]).toMatchObject({ status: 'reproducible', artifactDir: 'verified', actionCount: 4,
      hitCount: 2, replayMatches: 2, replayAttempts: 3 })
    const db = new Database(path.join(os.tmpdir(), `fuzz-store-${process.pid}`, 'findings.sqlite'))
    expect(db.prepare('SELECT COUNT(*) AS n FROM occurrences').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM replay_attempts').get()).toEqual({ n: 4 })
    db.close()
  })

  it('does not promote a drift replay or runner error', () => {
    const failure = { class: 'crash' as const, severity: 'hard' as const, message: 'renderer crash' }
    upsertFinding({ failure, artifactDir: 'a', actionCount: 8, status: 'new' })
    recordReplayAttempt({ failure, artifactDir: 'a', actionCount: 8, sequenceHash: 'full', targetSha: 'new-sha',
      result: { status: 'matched', step: 8, reproduced: [failure] }, allowPromotion: false })
    recordReplayAttempt({ failure, artifactDir: 'a', actionCount: 8, sequenceHash: 'full', targetSha: 'old-sha',
      result: { status: 'runner-error', step: 0, reproduced: [], message: 'launch failed' } })
    expect(listFindings()[0]?.status).toBe('new')
  })

  it('allows a confirmed zero-action boot reproduction', () => {
    const failure = { class: 'boot-timeout' as const, severity: 'hard' as const, message: 'timeout' }
    upsertFinding({ failure, artifactDir: 'a', actionCount: 8, status: 'new' })
    recordReplayAttempt({ failure, artifactDir: 'boot', actionCount: 0, sequenceHash: 'empty', targetSha: 'sha',
      result: { status: 'matched', step: 0, reproduced: [failure] } })
    expect(listFindings()[0]).toMatchObject({ status: 'reproducible', actionCount: 0, artifactDir: 'boot' })
  })
  it('migrates an older database without losing finding history', () => {
    const failure = { class: 'crash' as const, severity: 'hard' as const, message: 'old crash' }
    upsertFinding({ failure, artifactDir: 'legacy', actionCount: 7, status: 'reproducible' })
    const db = new Database(path.join(os.tmpdir(), `fuzz-store-${process.pid}`, 'findings.sqlite'))
    db.exec('ALTER TABLE findings DROP COLUMN best_sequence_hash; ALTER TABLE findings DROP COLUMN best_target_sha; DROP TABLE occurrences; DROP TABLE replay_attempts;')
    db.close()
    expect(listFindings()[0]).toMatchObject({ artifactDir: 'legacy', status: 'reproducible', hitCount: 1, replayAttempts: 0 })
  })
})
