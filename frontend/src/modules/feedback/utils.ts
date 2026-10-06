import { APP_VERSION } from '@/shared/config'
import { FeedbackCategory, type FeedbackClientMetadata } from './types'

/** Mirrors the API's limits; anything longer would be rejected rather than stored. */
export const MAX_USER_AGENT_LENGTH = 300
export const MAX_APP_VERSION_LENGTH = 40
const MAX_VIEWPORT_SIDE = 20_000

export const FEEDBACK_CATEGORY_LABELS: Readonly<
  Record<FeedbackCategory, string>
> = {
  [FeedbackCategory.BUG]: 'Bug',
  [FeedbackCategory.FEATURE_REQUEST]: 'Feature request',
  [FeedbackCategory.GENERAL]: 'General',
}

const clampSide = (value: number): number =>
  Math.min(MAX_VIEWPORT_SIDE, Math.max(1, Math.round(value)))

/**
 * What we send along with feedback so a bug report is reproducible: the
 * browser, the window size and the app build. Everything is trimmed to the
 * API's limits so a long user agent never makes a submission fail. The plan
 * is deliberately not included: the server reads it from the session.
 */
export const collectFeedbackContext = (): FeedbackClientMetadata => {
  const metadata: FeedbackClientMetadata = {}

  const userAgent = navigator.userAgent?.trim().slice(0, MAX_USER_AGENT_LENGTH)
  if (userAgent) metadata.userAgent = userAgent

  if (
    Number.isFinite(window.innerWidth) &&
    Number.isFinite(window.innerHeight) &&
    window.innerWidth > 0 &&
    window.innerHeight > 0
  ) {
    metadata.viewport = {
      width: clampSide(window.innerWidth),
      height: clampSide(window.innerHeight),
    }
  }

  const appVersion = APP_VERSION?.trim().slice(0, MAX_APP_VERSION_LENGTH)
  if (appVersion) metadata.appVersion = appVersion

  return metadata
}
