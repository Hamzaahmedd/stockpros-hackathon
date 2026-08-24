export function convertToMilliseconds(timeString: string): number | undefined {
  const match = timeString.match(/^(\d+)([smhd])$/);

  if (!match) {
    return undefined;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s": // seconds
      return value * 1000;
    case "m": // minutes
      return value * 60 * 1000;
    case "h": // hours
      return value * 60 * 60 * 1000;
    case "d": // days
      return value * 24 * 60 * 60 * 1000;
    default:
      return undefined;
  }
}
