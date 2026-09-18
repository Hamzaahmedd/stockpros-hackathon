import { PostHog } from 'posthog-node'
import { config } from '../../config'

// Backend events are low-volume, business-critical signals (account deletion,
// onboarding, alerts) rather than high-frequency telemetry — disable batching
// so each event sends immediately instead of risking loss if the process is
// killed before a batch would otherwise flush.
export const posthogClient = config.posthog.apiKey
  ? new PostHog(config.posthog.apiKey, {
      host: config.posthog.host,
      flushAt: 1,
      flushInterval: 0,
    })
  : null

export const PostHogEvent = {
  UserSignedIn: 'user_signed_in',
  OnboardingCompleted: 'onboarding_completed',
  AccountDeleted: 'account_deleted',
  WatchlistAlertTriggered: 'watchlist_alert_triggered',
  ForecastGenerated: 'forecast_generated',
} as const
export type PostHogEvent = (typeof PostHogEvent)[keyof typeof PostHogEvent]

export const AuthMethod = {
  MagicLink: 'magic_link',
  Google: 'google',
} as const
export type AuthMethod = (typeof AuthMethod)[keyof typeof AuthMethod]

export const captureEvent = (
  distinctId: string,
  event: PostHogEvent,
  properties?: Record<string, unknown>,
): void => {
  posthogClient?.capture({ distinctId, event, properties })
}
