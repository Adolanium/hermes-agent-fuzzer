const BORING_CONSOLE = [
  '__name is not defined',
  'Download the React DevTools',
  'Electron Security Warning',
  'Autofill.enable',
  'favicon',
  'install-stamp',
  'console-message',
  'deprecated',
  'third-party cookie',
]

const BORING_ALERT = /copied|clipboard|saved successfully|theme updated|^saved$|^done$|webhook receiver disabled|enable them here/i
const FAULT_ALERT = /error|fail|unable|invalid|denied|crash|timeout|lost|broke|exception|refused|unavailable|offline|wrong/i

export function isInterestingConsoleError(text: string): boolean {
  if (!text.trim()) {
    return false
  }
  if (BORING_CONSOLE.some((marker) => text.includes(marker))) {
    return false
  }
  return /error|failed|uncaught|typeerror|referenceerror|cannot read|is not a function|undefined is not|no queryclient/i.test(
    text,
  )
}

export function isInterestingAlert(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 3) {
    return false
  }
  if (BORING_ALERT.test(trimmed)) {
    return false
  }
  return FAULT_ALERT.test(trimmed)
}

export function isInterestingBodyFault(text: string): boolean {
  return /failed to send|completion failed|provider error|no queryclient|something broke|gateway (connection|dial) fail|uncaught|typeerror|referenceerror/i.test(
    text,
  )
}

export function isDesktopFaultLine(line: string): boolean {
  return (
    /\[main\] (Uncaught exception|Unhandled rejection):/i.test(line) ||
    /\[renderer/i.test(line) ||
    /renderer-error/i.test(line) ||
    /reportRendererError/i.test(line)
  )
}
