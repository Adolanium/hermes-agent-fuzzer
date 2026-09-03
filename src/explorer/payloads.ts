import * as fs from 'node:fs'
import * as path from 'node:path'

import { fuzzerRoot } from '../paths.ts'
import type { SeededRng } from '../rng.ts'

const BUILTIN = [
  '',
  'a',
  'Hello from the fuzzer',
  '../'.repeat(20) + 'etc/passwd',
  'A'.repeat(10_000),
  '\u202e\u202dRTL',
  '🔥🔥🔥',
  '{"a":' + '['.repeat(200),
  '---\nfoo: *id\nbar: *id\n',
  '\u0000\u0001\u0002',
  'newline\ninside',
  '\uD800',
]

export function loadPayloads(): string[] {
  const dir = path.join(fuzzerRoot(), 'fixtures', 'payloads')
  const values = [...BUILTIN]
  if (!fs.existsSync(dir)) {
    return values
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.txt')) {
      continue
    }
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        values.push(line)
      }
    }
  }
  return values
}

let cached: string[] | null = null

export function pickPayload(rng: SeededRng): string {
  if (!cached) {
    cached = loadPayloads()
  }
  return rng.pick(cached)
}

export function resetPayloadCache(): void {
  cached = null
}
