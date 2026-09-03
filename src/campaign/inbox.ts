import * as fs from 'node:fs'
import * as path from 'node:path'

import { deleteInternalFindings, listFindings } from '../findings/store.ts'
import { ensureDir, inboxPath } from '../paths.ts'

export function renderInbox(): string {
  const findings = listFindings()
  if (findings.length === 0) {
    return '# Finding inbox\n\nNo findings yet.\n'
  }
  const lines = [
    '# Finding inbox',
    '',
    `Updated: ${new Date().toISOString()}`,
    '',
    '| id | class | hits | status | route | message | artifact |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const finding of findings) {
    const msg = finding.message.replace(/\|/g, '/').slice(0, 80)
    const related = finding.relatedTo ? ` (related ${finding.relatedTo})` : ''
    lines.push(
      `| ${finding.id} | ${finding.class} | ${finding.hitCount} | ${finding.status}${related} | ${finding.route} | ${msg} | ${finding.artifactDir} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

export function writeInbox(): string {
  deleteInternalFindings()
  const md = renderInbox()
  ensureDir(path.dirname(inboxPath()))
  fs.writeFileSync(inboxPath(), md, 'utf8')
  return md
}
