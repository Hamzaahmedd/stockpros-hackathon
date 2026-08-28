import {
  SUMMARY_MAX_BULLET_LEN,
  SUMMARY_MAX_BULLETS,
  SUMMARY_MIN_BULLET_LEN,
} from '../constants'

const cleanBullet = (raw: string): string => {
  let s = raw
    .trim()
    .replace(/^[\-\*\.\d+\.\)]\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!s) return ''

  s = s.charAt(0).toUpperCase() + s.slice(1)

  if (s.length > SUMMARY_MAX_BULLET_LEN) {
    s = s.slice(0, SUMMARY_MAX_BULLET_LEN).trim()
    const lastSpace = s.lastIndexOf(' ')
    if (lastSpace > SUMMARY_MAX_BULLET_LEN * 0.7) s = s.slice(0, lastSpace)
    s = s + '...'
  }

  if (!/[.!?…]$/.test(s)) s = s + '.'

  return s
}

export const parseSummaryBullets = (
  rawSummary: string | null | undefined,
): string[] => {
  if (!rawSummary?.trim()) return []

  const cleaned = rawSummary.trim()
  const strategies = [
    () => cleaned.split(/\.\s+(?=[A-Z])/),
    () => cleaned.split(/;\s*/),
    () => cleaned.split(/\s+[—–-]\s+/),
  ]

  for (const split of strategies) {
    const candidates = split()
      .map(cleanBullet)
      .filter((s) => s.length >= SUMMARY_MIN_BULLET_LEN)

    if (candidates.length >= 2) return candidates.slice(0, SUMMARY_MAX_BULLETS)
  }

  const fallback = cleanBullet(cleaned)
  return fallback.length >= SUMMARY_MIN_BULLET_LEN ? [fallback] : []
}
