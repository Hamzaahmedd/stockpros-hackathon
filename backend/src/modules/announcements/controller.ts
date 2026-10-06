import { NextFunction, Response } from 'express'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import type { AuthenticatedRequest } from '../auth'
import {
  getBootPayload,
  listChangelog,
  markAllSeen,
  recordAction,
  resolveAudience,
  StateAction,
} from './service'
import {
  announcementIdParamValidator,
  changelogQueryValidator,
} from './validation'

export const getBoot = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const payload = await getBootPayload(userId, await resolveAudience(userId))
    return sendSuccess(res, {
      message: 'Announcements retrieved successfully.',
      data: payload,
    })
  } catch (error) {
    next(error)
  }
}

export const getChangelog = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const query = validateOrThrow(changelogQueryValidator, req.query)
    const page = await listChangelog(
      userId,
      await resolveAudience(userId),
      query,
    )
    return sendSuccess(res, {
      message: 'Announcements retrieved successfully.',
      data: page.items,
      extra: { total: page.total, unreadCount: page.unreadCount },
    })
  } catch (error) {
    next(error)
  }
}

const recordFor =
  (action: StateAction, message: string) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req)
      const { id } = validateOrThrow(announcementIdParamValidator, req.params)
      await recordAction(userId, id, action)
      return sendSuccess(res, { message })
    } catch (error) {
      next(error)
    }
  }

export const dismissAnnouncement = recordFor(
  StateAction.DISMISSED,
  'Announcement dismissed.',
)

export const markAnnouncementSeen = recordFor(
  StateAction.SEEN,
  'Announcement marked as seen.',
)

export const markAllAnnouncementsSeen = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const updated = await markAllSeen(userId, await resolveAudience(userId))
    return sendSuccess(res, {
      message: 'Announcements marked as seen.',
      extra: { updated },
    })
  } catch (error) {
    next(error)
  }
}
