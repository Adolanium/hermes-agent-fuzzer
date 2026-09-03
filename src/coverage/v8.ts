import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from 'playwright'

import { artifactsRoot, ensureDir } from '../paths.ts'
import { logInfo } from '../log.ts'

export type FileCoverage = {
  url: string
  used: number
  total: number
}

export async function startJsCoverage(page: Page): Promise<void> {
  await page.coverage.startJSCoverage({ resetOnNavigation: false })
}

export async function stopJsCoverage(page: Page): Promise<FileCoverage[]> {
  const entries = await page.coverage.stopJSCoverage()
  const files: FileCoverage[] = []
  for (const entry of entries) {
    const total = entry.source?.length ?? 0
    let used = 0
    for (const fn of entry.functions) {
      for (const range of fn.ranges) {
        if (range.count > 0) {
          used += range.endOffset - range.startOffset
        }
      }
    }
    files.push({ url: entry.url, used, total })
  }
  files.sort((a, b) => a.used / Math.max(a.total, 1) - b.used / Math.max(b.total, 1))
  return files
}

export function writeCoverageReport(files: FileCoverage[]): void {
  ensureDir(artifactsRoot())
  const out = path.join(artifactsRoot(), 'v8-coverage.json')
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2), 'utf8')
  const untouched = files.filter((f) => f.used === 0).length
  logInfo('wrote v8 coverage', { files: files.length, untouched, out })
}
