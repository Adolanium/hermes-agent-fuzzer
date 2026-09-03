export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value.trim())
  if (!match) {
    throw new Error(`Bad duration: ${value}. Use 30s, 5m, 8h.`)
  }
  const amount = Number(match[1])
  const unit = match[2] ?? 'ms'
  switch (unit) {
    case 'ms':
      return amount
    case 's':
      return amount * 1000
    case 'm':
      return amount * 60_000
    case 'h':
      return amount * 3_600_000
    default:
      return amount
  }
}
