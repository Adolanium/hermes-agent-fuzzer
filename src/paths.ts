import * as fs from 'node:fs'
import * as path from 'node:path'

export function fuzzerRoot(): string {
  return path.resolve(import.meta.dirname, '..')
}

export function artifactsRoot(): string {
  return path.join(fuzzerRoot(), 'artifacts')
}

export function findingsRoot(): string {
  return path.join(artifactsRoot(), 'findings')
}

export function corpusRoot(): string {
  return path.join(artifactsRoot(), 'corpus')
}

export function coveragePath(): string {
  return path.join(artifactsRoot(), 'coverage.json')
}

export function findingsDbPath(): string {
  return path.join(artifactsRoot(), 'findings.sqlite')
}

export function inboxPath(): string {
  return path.join(artifactsRoot(), 'inbox.md')
}

export function fuzzerVersion(): string {
  const raw = fs.readFileSync(path.join(fuzzerRoot(), 'package.json'), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    return '0.0.0'
  }
  const version = parsed.version
  return typeof version === 'string' ? version : '0.0.0'
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}
