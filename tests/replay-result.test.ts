import { describe, expect, it } from 'vitest'
import { executeReplay, matchesFailure } from '../src/record/result.ts'
import { ddmin } from '../src/reduce/ddmin.ts'
import { classifyFaults } from '../src/oracle/detect.ts'
import type { Failure, RecordedAction } from '../src/types.ts'

const crash: Failure = { class: 'crash', severity: 'hard', message: 'renderer crash: injected', stack: 'renderer crash: injected' }
const click = (key: string): RecordedAction => ({ type: 'press', key, window: 'main', t: 1, seedStep: 1 })

describe('failure identity and replay execution', () => {
  it('rejects an unrelated failure of the same class', () => {
    expect(matchesFailure(crash, { ...crash, stack: 'renderer crash: unrelated' })).toBe(false)
    expect(matchesFailure(crash, { ...crash, severity: 'soft' })).toBe(false)
    expect(matchesFailure(crash, { ...crash, route: '/settings' })).toBe(false)
  })

  it('reports the precise failed step instead of continuing', async () => {
    let calls = 0
    const result = await executeReplay({ expected: crash, actions: [click('a'), click('b'), click('c')],
      perform: async () => ({ ok: ++calls !== 2, error: 'locator missing' }), observe: async () => [] })
    expect(result).toMatchObject({ status: 'diverged', step: 2, message: 'locator missing' })
    expect(calls).toBe(2)
  })

  it('preserves recorded misses and detects changed outcomes', async () => {
    const actions = [{ ...click('a'), outcome: { ok: false } }]
    expect((await executeReplay({ expected: crash, actions, perform: async () => ({ ok: false }), observe: async () => [] })).status).toBe('not-reproduced')
    expect((await executeReplay({ expected: crash, actions, perform: async () => ({ ok: true }), observe: async () => [] })).status).toBe('diverged')
  })

  it('detects the intended crash even when it makes its triggering action fail', async () => {
    let triggered = false
    const result = await executeReplay({ expected: crash, actions: [click('crash')],
      perform: async () => { triggered = true; return { ok: false } }, observe: async () => triggered ? [crash] : [] })
    expect(result.status).toBe('matched')
  })

  it('finds and reduces an injected crash without accepting a different crash', async () => {
    const replay = async (actions: RecordedAction[]) => {
      let armed = false
      let errors: string[] = []
      return executeReplay({ expected: crash, actions,
        perform: async (action) => {
          if (action.type === 'press') {
            if (action.key === 'arm') armed = true
            if (action.key === 'crash') errors = [armed ? 'renderer crash: injected' : 'renderer crash: unrelated']
          }
          return { ok: true }
        },
        observe: async () => classifyFaults({ closed: false, mainGone: false, pageErrors: errors, consoleErrors: [], desktopLog: '' }),
      })
    }
    const actions = ['noise', 'arm', 'noise', 'crash', 'noise'].map(click)
    expect((await replay(actions)).status).toBe('matched')
    const minimized = await ddmin(actions, async (candidate) => (await replay(candidate)).status === 'matched')
    expect(minimized.map((action) => action.type === 'press' && action.key)).toEqual(['arm', 'crash'])
    expect((await replay([click('crash')])).status).toBe('different-failure')
  })
})
