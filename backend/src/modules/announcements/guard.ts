import { NextFunction, Request, Response } from 'express'
import config from '@/config'
import { FeatureDisabledError } from '../../shared/errors'

/** Every announcements route (user and staff) answers 403 while the feature flag is off. */
export const requireAnnouncementsEnabled = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void =>
  next(
    config.features.enableAnnouncements
      ? undefined
      : new FeatureDisabledError('Announcements are not enabled'),
  )
