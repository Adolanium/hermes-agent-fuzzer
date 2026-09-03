import type { Failure } from '../types.ts'

export function isFuzzerInternalError(failure: Pick<Failure, 'message' | 'stack'>): boolean {
  return `${failure.message}\n${failure.stack ?? ''}`.includes('__name is not defined')
}

export function isFuzzerInternalMessage(message: string): boolean {
  return message.includes('__name is not defined')
}
