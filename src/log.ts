export type LogLevel = 'info' | 'warn' | 'error'

export function log(level: LogLevel, message: string, extra: Record<string, unknown> = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...extra,
  }
  const sink = level === 'error' ? process.stderr : process.stdout
  sink.write(`${JSON.stringify(line)}\n`)
}

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  log('info', message, extra)
}

export function logWarn(message: string, extra?: Record<string, unknown>): void {
  log('warn', message, extra)
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  log('error', message, extra)
}
