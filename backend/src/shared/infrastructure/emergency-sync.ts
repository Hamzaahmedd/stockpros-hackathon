import { getRawRedisClient } from './cache'
import { logger } from './logger'
import { setEmergencyClosed } from '../utils/market-hours'

/**
 * Shares the emergency market halt across instances through Redis. Each
 * instance still reads its own in-memory flag (a hot, synchronous path); this
 * module writes changes to Redis and polls it so every instance converges
 * within one interval. Without Redis the halt stays per-process.
 */
export const EMERGENCY_STATE_KEY = 'market:emergency-closed'
export const EMERGENCY_SYNC_INTERVAL_MS = 5_000

const STATE_CLOSED = '1'
const STATE_OPEN = '0'

let timer: NodeJS.Timeout | null = null

/** Stores the halt state for other instances. Returns false when Redis could not be reached. */
export async function persistEmergencyClosed(
  closed: boolean,
): Promise<boolean> {
  const redis = getRawRedisClient()
  if (!redis) {
    logger.warn(
      '[MarketHours] Redis unavailable: emergency halt applies to this instance only',
    )
    return false
  }
  try {
    await redis.set(EMERGENCY_STATE_KEY, closed ? STATE_CLOSED : STATE_OPEN)
    return true
  } catch (err) {
    logger.warn(
      `[MarketHours] Could not share emergency halt via Redis: ${String(err)}`,
    )
    return false
  }
}

/** Applies the shared state locally. An absent key leaves the env-seeded value alone. */
export async function reconcileEmergencyClosed(): Promise<void> {
  const redis = getRawRedisClient()
  if (!redis) return
  try {
    const stored = await redis.get(EMERGENCY_STATE_KEY)
    if (stored === null) return
    setEmergencyClosed(stored === STATE_CLOSED)
  } catch (err) {
    logger.warn(`[MarketHours] Emergency halt sync failed: ${String(err)}`)
  }
}

export function startEmergencySync(): void {
  if (timer) return
  void reconcileEmergencyClosed()
  timer = setInterval(
    () => void reconcileEmergencyClosed(),
    EMERGENCY_SYNC_INTERVAL_MS,
  )
  timer.unref()
}

export function stopEmergencySync(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
