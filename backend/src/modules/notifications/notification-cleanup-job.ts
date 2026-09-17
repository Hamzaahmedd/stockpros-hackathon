import { logger } from '../../shared/infrastructure/logger'
import config from '@/config'
import { deleteExpiredNotifications } from './notification-query-service'

/**
 * Purges in-app notifications past the retention window,
 * regardless of read state.
 */
export const runNotificationCleanupJob = async (): Promise<void> => {
  logger.info('[CronJob] Running notification cleanup job')
  try {
    const { deleted } = await deleteExpiredNotifications(
      config.notifications.retentionDays,
    )
    logger.info(`[CronJob] Notification cleanup deleted ${deleted} rows`)
  } catch (err) {
    logger.error(
      `[CronJob] Notification cleanup job failed: ${(err as Error).message}`,
    )
  }
}
