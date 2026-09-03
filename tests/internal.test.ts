import { describe, expect, it } from 'vitest'

import { isFuzzerInternalError, isFuzzerInternalMessage } from '../src/findings/internal.ts'

describe('fuzzer-internal errors', () => {
  it('ignores the tsx __name evaluate leak', () => {
    expect(
      isFuzzerInternalError({
        message: 'page.evaluate: ReferenceError: __name is not defined',
        stack: 'at scanDom',
      }),
    ).toBe(true)
    expect(isFuzzerInternalMessage('page.evaluate: ReferenceError: __name is not defined')).toBe(true)
    expect(isFuzzerInternalError({ message: 'TypeError: Cannot read properties of null' })).toBe(false)
  })
})
