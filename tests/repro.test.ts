import { describe, expect, it } from 'vitest'

import { writeReproMarkdown } from '../src/artifacts/repro.ts'
import type { RecordedAction } from '../src/types.ts'

describe('repro.md', () => {
  it('lists numbered steps and the SHA', () => {
    const actions: RecordedAction[] = [
      {
        type: 'navigate',
        t: 1,
        seedStep: 1,
        hash: '/settings',
        window: 'main',
      },
      {
        type: 'click',
        t: 2,
        seedStep: 2,
        locator: { strategy: 'role', role: 'tab', name: 'Safety', nth: 0, window: 'main' },
      },
    ]
    const md = writeReproMarkdown({
      target: {
        remote: 'https://github.com/NousResearch/hermes-agent.git',
        branch: 'main',
        sha: 'abc123',
        dirty: false,
        root: 'x',
        desktopRoot: 'y',
      },
      profile: 'mock-backend',
      seed: 42,
      actions,
      failure: { class: 'hang', severity: 'hard', message: 'evaluate exceeded 20000ms' },
      fuzzerVersion: '0.0.1',
    })
    expect(md).toContain('abc123')
    expect(md).toContain('1. Go to #/settings')
    expect(md).toContain('Safety')
    expect(md).toContain('Seed: 42')
    expect(md).toContain('Config mutant: sane')
  })
})
