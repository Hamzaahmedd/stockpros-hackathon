import config from '@/config'
import { getRawRedisClient } from './cache'
import { logger } from './logger'

export interface AlertSlot {
  /** True for the first alert of a window; false when it should be held back. */
  send: boolean
  /** Alerts held back since the last one that was sent (reported with the next send). */
  suppressed: number
}

const memory = new Map<string, { until: number; suppressed: number }>()
const MEMORY_PRUNE_AT = 500

/** Per-process fallback when Redis is missing or failing: each instance alerts at most once a window. */
const claimInMemory = (
  scope: string,
  windowSeconds: number,
  nowMs: number,
): AlertSlot => {
  const entry = memory.get(scope)
  if (entry && entry.until > nowMs) {
    entry.suppressed += 1
    return { send: false, suppressed: entry.suppressed }
  }

  const carried = entry?.suppressed ?? 0
  memory.set(scope, { until: nowMs + windowSeconds * 1000, suppressed: 0 })
  if (memory.size > MEMORY_PRUNE_AT) {
    for (const [key, value] of memory) {
      if (value.until <= nowMs && value.suppressed === 0) memory.delete(key)
    }
  }
  return { send: true, suppressed: carried }
}

const claimInRedis = async (
  scope: string,
  windowSeconds: number,
): Promise<AlertSlot | null> => {
  const client = config.cache.enabled ? getRawRedisClient() : null
  if (!client) return null

  const slotKey = `opsalert:slot:${scope}`
  const countKey = `opsalert:count:${scope}`
  try {
    const claimed = await client.set(slotKey, '1', 'EX', windowSeconds, 'NX')
    if (claimed === 'OK') {
      const carried = Number(await client.get(countKey)) || 0
      if (carried > 0) await client.del(countKey)
      return { send: true, suppressed: carried }
    }
    const suppressed = await client.incr(countKey)
    // Outlive the window so the next alert can report it, but never forever.
    if (suppressed === 1) await client.expire(countKey, windowSeconds * 2)
    return { send: false, suppressed }
  } catch (err) {
    logger.warn(`[OpsAlert] throttle store failed: ${String(err)}`)
    return null
  }
}

/**
 * Storm control: the first alert for `scope` in a window is sent, the rest are
 * counted instead, and the next one that is sent says how many were held back.
 * Shared across instances through Redis; per process when Redis is not available.
 */
export async function claimAlertSlot(
  scope: string,
  windowSeconds: number,
  nowMs: number = Date.now(),
): Promise<AlertSlot> {
  return (
    (await claimInRedis(scope, windowSeconds)) ??
    claimInMemory(scope, windowSeconds, nowMs)
  )
}
