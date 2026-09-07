const TIME_STRING_RE = /^(\d+)([smhd])$/

export function convertToMilliseconds(timeString: string): number | undefined {
  const match = TIME_STRING_RE.exec(timeString)

  if (!match) {
    return undefined
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's': // seconds
      return value * 1000
    case 'm': // minutes
      return value * 60 * 1000
    case 'h': // hours
      return value * 60 * 60 * 1000
    case 'd': // days
      return value * 24 * 60 * 60 * 1000
    default:
      return undefined
  }
}
