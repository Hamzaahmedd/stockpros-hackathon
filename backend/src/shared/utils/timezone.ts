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
