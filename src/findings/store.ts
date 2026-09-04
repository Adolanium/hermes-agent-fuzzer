import * as fs from 'node:fs'
import * as path from 'node:path'

import Database from 'better-sqlite3'

import { ensureDir, findingsDbPath } from '../paths.ts'
import type { Failure, FindingStatus } from '../types.ts'
import { fingerprintOf, similarAlert } from './fingerprint.ts'
import { isFuzzerInternalMessage } from './internal.ts'
import type { ReplayResult } from '../record/result.ts'

export type StoredFinding = {
  id: string
  fingerprint: string
  class: string
  severity: string
  message: string
  route: string
  alertText: string
  status: FindingStatus
  hitCount: number
  artifactDir: string
  relatedTo: string | null
  createdAt: string
  updatedAt: string
  actionCount: number
  replayAttempts: number
  replayMatches: number
}

function openDb(): Database.Database {
  ensureDir(path.dirname(findingsDbPath()))
  const db = new Database(findingsDbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      class TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      route TEXT NOT NULL,
      alert_text TEXT NOT NULL,
      status TEXT NOT NULL,
      hit_count INTEGER NOT NULL,
      artifact_dir TEXT NOT NULL,
      related_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action_count INTEGER NOT NULL
    )
  `)
  const columns = db.prepare('PRAGMA table_info(findings)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'best_sequence_hash')) {
    db.exec('ALTER TABLE findings ADD COLUMN best_sequence_hash TEXT')
  }
  if (!columns.some((column) => column.name === 'best_target_sha')) {
    db.exec('ALTER TABLE findings ADD COLUMN best_target_sha TEXT')
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS occurrences (
      id INTEGER PRIMARY KEY, finding_id TEXT NOT NULL, artifact_dir TEXT NOT NULL,
      action_count INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS replay_attempts (
      id INTEGER PRIMARY KEY, finding_id TEXT NOT NULL, artifact_dir TEXT NOT NULL,
      target_sha TEXT NOT NULL, sequence_hash TEXT NOT NULL, action_count INTEGER NOT NULL,
      status TEXT NOT NULL, step INTEGER NOT NULL, message TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS replay_evidence ON replay_attempts
      (finding_id, artifact_dir, sequence_hash, target_sha);
  `)
  return db
}

function rowToFinding(row: Record<string, unknown>): StoredFinding {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    class: String(row.class),
    severity: String(row.severity),
    message: String(row.message),
    route: String(row.route),
    alertText: String(row.alert_text),
    status: row.status === 'reproducible' || row.status === 'flaky' || row.status === 'new' ? row.status : 'new',
    hitCount: Number(row.hit_count),
    artifactDir: String(row.artifact_dir),
    relatedTo: row.related_to === null || row.related_to === undefined ? null : String(row.related_to),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    actionCount: Number(row.action_count),
    replayAttempts: Number(row.replay_attempts ?? 0),
    replayMatches: Number(row.replay_matches ?? 0),
  }
}

export function upsertFinding(input: {
  failure: Failure
  artifactDir: string
  actionCount: number
  status: FindingStatus
}): { finding: StoredFinding; duplicate: boolean } {
  const db = openDb()
  try {
    const fingerprint = fingerprintOf(input.failure)
    const now = new Date().toISOString()
    db.prepare('INSERT INTO occurrences (finding_id, artifact_dir, action_count, created_at) VALUES (?, ?, ?, ?)')
      .run(fingerprint.slice(0, 12), input.artifactDir, input.actionCount, now)
    const existing = db.prepare('SELECT * FROM findings WHERE fingerprint = ?').get(fingerprint)
    if (existing && typeof existing === 'object') {
      const found = rowToFinding(existing as Record<string, unknown>)
      const shorter = (input.status === 'reproducible' && found.status !== 'reproducible')
        || (input.actionCount < found.actionCount && (found.status !== 'reproducible' || input.status === 'reproducible'))
      db.prepare(
        `UPDATE findings SET hit_count = hit_count + 1, updated_at = ?, status = ?,
         artifact_dir = CASE WHEN ? THEN ? ELSE artifact_dir END,
         action_count = CASE WHEN ? THEN ? ELSE action_count END
         WHERE fingerprint = ?`,
      ).run(now, found.status === 'reproducible' ? found.status : input.status === 'new' ? found.status : input.status,
        shorter ? 1 : 0, input.artifactDir, shorter ? 1 : 0, input.actionCount, fingerprint)
      if (shorter) db.prepare('UPDATE findings SET best_sequence_hash = NULL WHERE fingerprint = ?').run(fingerprint)
      const updated = db.prepare('SELECT * FROM findings WHERE fingerprint = ?').get(fingerprint)
      return { finding: rowToFinding(updated as Record<string, unknown>), duplicate: true }
    }

    const related = findRelated(db, input.failure)
    const id = fingerprint.slice(0, 12)
    db.prepare(
      `INSERT INTO findings (id, fingerprint, class, severity, message, route, alert_text, status, hit_count, artifact_dir, related_to, created_at, updated_at, action_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      fingerprint,
      input.failure.class,
      input.failure.severity,
      input.failure.message,
      input.failure.route ?? '',
      input.failure.alertText ?? '',
      input.status,
      input.artifactDir,
      related,
      now,
      now,
      input.actionCount,
    )
    const inserted = db.prepare('SELECT * FROM findings WHERE id = ?').get(id)
    return { finding: rowToFinding(inserted as Record<string, unknown>), duplicate: false }
  } finally {
    db.close()
  }
}

function findRelated(db: Database.Database, failure: Failure): string | null {
  const rows = db.prepare('SELECT * FROM findings WHERE class = ?').all(failure.class)
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      continue
    }
    const found = rowToFinding(row as Record<string, unknown>)
    if (found.route === (failure.route ?? '') && similarAlert(found.alertText || found.message, failure.alertText || failure.message)) {
      return found.id
    }
  }
  return null
}

export function listFindings(): StoredFinding[] {
  if (!fs.existsSync(findingsDbPath())) {
    return []
  }
  const db = openDb()
  try {
    const rows = db.prepare(`SELECT findings.*,
      (SELECT COUNT(*) FROM replay_attempts r WHERE r.finding_id = findings.id
        AND r.artifact_dir = findings.artifact_dir AND r.sequence_hash = findings.best_sequence_hash
        AND r.target_sha = findings.best_target_sha) AS replay_attempts,
      (SELECT COUNT(*) FROM replay_attempts r WHERE r.finding_id = findings.id
        AND r.artifact_dir = findings.artifact_dir AND r.sequence_hash = findings.best_sequence_hash
        AND r.target_sha = findings.best_target_sha
        AND r.status = 'matched') AS replay_matches
      FROM findings ORDER BY updated_at DESC`).all()
    return rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null).map(rowToFinding)
  } finally {
    db.close()
  }
}

export function recordReplayAttempt(input: {
  failure: Failure; artifactDir: string; targetSha: string; sequenceHash: string;
  actionCount: number; result: ReplayResult; allowPromotion?: boolean
}): void {
  const db = openDb()
  try {
    const id = fingerprintOf(input.failure).slice(0, 12)
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`INSERT INTO replay_attempts
        (finding_id, artifact_dir, target_sha, sequence_hash, action_count, status, step, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.artifactDir, input.targetSha, input.sequenceHash,
          input.actionCount, input.result.status, input.result.step, input.result.message ?? null, now)
      const row = db.prepare('SELECT * FROM findings WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row || input.allowPromotion === false) return
      const found = rowToFinding(row)
      if (input.result.status === 'matched' && (found.status !== 'reproducible' || input.actionCount <= found.actionCount)) {
        db.prepare(`UPDATE findings SET status = 'reproducible', artifact_dir = ?, action_count = ?,
          best_sequence_hash = ?, best_target_sha = ?, updated_at = ? WHERE id = ?`)
          .run(input.artifactDir, input.actionCount, input.sequenceHash, input.targetSha, now, id)
      } else if (found.status !== 'reproducible' && found.artifactDir === input.artifactDir
        && ['not-reproduced', 'different-failure'].includes(input.result.status)) {
        db.prepare("UPDATE findings SET status = 'flaky', best_sequence_hash = ?, best_target_sha = ?, updated_at = ? WHERE id = ?")
          .run(input.sequenceHash, input.targetSha, now, id)
      }
    })()
  } finally { db.close() }
}

export function deleteInternalFindings(): number {
  if (!fs.existsSync(findingsDbPath())) {
    return 0
  }
  const db = openDb()
  try {
    const rows = db.prepare('SELECT id, message FROM findings').all()
    let removed = 0
    const del = db.prepare('DELETE FROM findings WHERE id = ?')
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || !('id' in row) || !('message' in row)) {
        continue
      }
      if (typeof row.message === 'string' && isFuzzerInternalMessage(row.message)) {
        del.run(row.id)
        removed += 1
      }
    }
    return removed
  } finally {
    db.close()
  }
}
