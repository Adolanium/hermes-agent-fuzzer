import * as crypto from 'node:crypto'

import type { Failure } from '../types.ts'

const PATH_RE = /(?:[A-Za-z]:)?[\\/](?:Users|home|Developer|src|apps)[^\s:)]+/g
const ADDR_RE = /0x[0-9a-fA-F]+/g
const TS_RE = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g
const SESSION_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export function normalizeStack(stack: string): string {
  return stack
    .replace(PATH_RE, '<path>')
    .replace(ADDR_RE, '<addr>')
    .replace(TS_RE, '<ts>')
    .replace(SESSION_RE, '<id>')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function stackTop5(stack: string): string {
  return normalizeStack(stack)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join('\n')
}

export function fingerprintOf(failure: Failure): string {
  const material = [
    failure.class,
    stackTop5(failure.stack ?? failure.message),
    failure.route ?? '',
    failure.alertText ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(material).digest('hex')
}

export function sequenceHash(actionsJson: string): string {
  return crypto.createHash('sha256').update(actionsJson).digest('hex')
}

export function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

export function tokenOverlap(a: string, b: string): number {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (left.size === 0 || right.size === 0) {
    return 0
  }
  let inter = 0
  for (const token of left) {
    if (right.has(token)) {
      inter += 1
    }
  }
  return inter / Math.max(left.size, right.size)
}

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const grid: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
  for (let i = 0; i < rows; i += 1) {
    const row = grid[i]
    if (row) {
      row[0] = i
    }
  }
  const first = grid[0]
  if (first) {
    for (let j = 0; j < cols; j += 1) {
      first[j] = j
    }
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = grid[i]
      const prev = grid[i - 1]
      if (!row || !prev) {
        continue
      }
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
  }
  return grid[a.length]?.[b.length] ?? 0
}

export function similarAlert(a: string, b: string): boolean {
  if (!a || !b) {
    return false
  }
  if (tokenOverlap(a, b) >= 0.6) {
    return true
  }
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) {
    return true
  }
  return levenshtein(a, b) / maxLen <= 0.25
}
