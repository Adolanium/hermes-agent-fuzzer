import { describe, expect, it } from 'vitest'

import { cheapCuts, ddmin } from '../src/reduce/ddmin.ts'

describe('ddmin', () => {
  it('shrinks to the smallest failing subset', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const reduced = await ddmin(items, async (subset) => subset.includes(3) && subset.includes(7))
    expect(reduced.sort()).toEqual([3, 7])
  })

  it('returns the original list when the predicate never holds on a cut', async () => {
    const items = [1, 2, 3]
    const reduced = await ddmin(items, async (subset) => subset.length === 3)
    expect(reduced).toEqual([1, 2, 3])
  })

  it('offers last-32 and last-8 cheap cuts', () => {
    const items = Array.from({ length: 40 }, (_, i) => i)
    const cuts = cheapCuts(items)
    expect(cuts[0]).toHaveLength(32)
    expect(cuts[1]).toHaveLength(8)
  })
})
