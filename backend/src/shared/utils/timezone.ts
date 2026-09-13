export const PKT_TIMEZONE = 'Asia/Karachi'

export const getPakistanHour = (date: Date = new Date()): number =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PKT_TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  )

export const getPakistanMonth = (date: Date = new Date()): number =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PKT_TIMEZONE,
      month: 'numeric',
    }).format(date),
  ) - 1

/** Time-of-day greeting in Pakistan Standard Time. */
export const getPakistanGreeting = (date: Date = new Date()): string => {
  const hour = getPakistanHour(date)
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

/** Human-readable timestamp with an explicit PKT label (never GMT+5). */
export const formatPakistanTimestamp = (date: Date = new Date()): string => {
  const formatted = date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PKT_TIMEZONE,
  })
  return `${formatted} PKT`
}

export const getPakistanYear = (date: Date = new Date()): number =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PKT_TIMEZONE,
      year: 'numeric',
    }).format(date),
  )

/** `YYYY-MM-DD HH:mm:ss` in Pakistan Standard Time (24h clock). */
export const formatPakistanDateTime24 = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PKT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}
