import type { Failure, RecordedAction } from '../types.ts'

export function cheapSoftMinimize(failure: Failure, actions: RecordedAction[]): RecordedAction[] | null {
  if (failure.class !== 'no-reply' && failure.class !== 'alert') {
    return null
  }
  const kept = actions.filter((action) => {
    if (action.type === 'navigate') {
      return action.hash === '/' || action.hash.includes('settings') || action.hash.includes('providers')
    }
    if (action.type === 'type') {
      return true
    }
    if (action.type === 'press') {
      return action.key === 'Enter' || action.key === 'Escape'
    }
    if (action.type === 'click') {
      if (action.locator.strategy === 'css' && 'css' in action.locator) {
        return action.locator.css.includes('composer')
      }
      return false
    }
    return false
  })
  if (kept.length === 0 || kept.length >= actions.length) {
    return null
  }
  return kept
}
