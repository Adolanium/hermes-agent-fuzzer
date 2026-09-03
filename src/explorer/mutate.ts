import * as fs from 'node:fs'
import * as path from 'node:path'

import { corpusRoot, ensureDir } from '../paths.ts'
import type { SeededRng } from '../rng.ts'
import type { RecordedAction } from '../types.ts'
import { pickPayload } from './payloads.ts'

export type CorpusEntry = {
  id: string
  stateId: string
  actions: RecordedAction[]
}

export function saveCorpusEntry(entry: CorpusEntry): void {
  ensureDir(corpusRoot())
  fs.writeFileSync(path.join(corpusRoot(), `${entry.id}.json`), JSON.stringify(entry, null, 2), 'utf8')
}

export function loadCorpus(): CorpusEntry[] {
  const dir = corpusRoot()
  if (!fs.existsSync(dir)) {
    return []
  }
  const entries: CorpusEntry[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && 'actions' in parsed && 'id' in parsed && 'stateId' in parsed) {
        const record = parsed as CorpusEntry
        if (Array.isArray(record.actions)) {
          entries.push(record)
        }
      }
    } catch {
      // skip bad corpus file
    }
  }
  return entries
}

export function mutateSequence(actions: RecordedAction[], rng: SeededRng): RecordedAction[] {
  if (actions.length === 0) {
    return []
  }
  const copy = actions.map((action) => ({ ...action }))
  const roll = rng.next()
  if (roll < 0.25 && copy.length > 2) {
    const i = rng.int(copy.length)
    copy.splice(i, 1)
  } else if (roll < 0.5 && copy.length > 1) {
    const i = rng.int(copy.length)
    const j = rng.int(copy.length)
    const a = copy[i]
    const b = copy[j]
    if (a && b) {
      copy[i] = b
      copy[j] = a
    }
  } else if (roll < 0.75) {
    const typed = copy.filter((a) => a.type === 'type')
    if (typed.length > 0) {
      const target = rng.pick(typed)
      if (target.type === 'type') {
        target.value = pickPayload(rng)
      }
    }
  } else {
    const click = copy.find((a) => a.type === 'click')
    if (click) {
      copy.push({ ...click, t: Date.now(), seedStep: rng.step })
    }
  }
  return copy
}

export function pickMutatedCorpus(rng: SeededRng): RecordedAction[] | null {
  const corpus = loadCorpus()
  if (corpus.length === 0) {
    return null
  }
  return mutateSequence(rng.pick(corpus).actions, rng)
}
