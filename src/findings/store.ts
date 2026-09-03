import * as fs from 'node:fs'
import * as path from 'node:path'

import Database from 'better-sqlite3'

import { ensureDir, findingsDbPath } from '../paths.ts'
import type { Failure, FindingStatus } from '../types.ts'
import { fingerprintOf, similarAlert } from './fingerprint.ts'
import { isFuzzerInternalMessage } from './internal.ts'

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
    const existing = db.prepare('SELECT * FROM findings WHERE fingerprint = ?').get(fingerprint)
    if (existing && typeof existing === 'object') {
      const found = rowToFinding(existing as Record<string, unknown>)
      const shorter = input.actionCount > 0 && input.actionCount < found.actionCount
      db.prepare(
        `UPDATE findings SET hit_count = hit_count + 1, updated_at = ?, status = ?,
         artifact_dir = CASE WHEN ? THEN ? ELSE artifact_dir END,
         action_count = CASE WHEN ? THEN ? ELSE action_count END
         WHERE fingerprint = ?`,
      ).run(now, input.status, shorter ? 1 : 0, input.artifactDir, shorter ? 1 : 0, input.actionCount, fingerprint)
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
    const rows = db.prepare('SELECT * FROM findings ORDER BY updated_at DESC').all()
    return rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null).map(rowToFinding)
  } finally {
    db.close()
  }
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

export function updateFindingStatus(id: string, status: FindingStatus, actionCount?: number): void {
  const db = openDb()
  try {
    if (actionCount === undefined) {
      db.prepare('UPDATE findings SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
    } else {
      db.prepare('UPDATE findings SET status = ?, action_count = ?, updated_at = ? WHERE id = ?').run(
        status,
        actionCount,
        new Date().toISOString(),
        id,
      )
    }
  } finally {
    db.close()
  }
}
