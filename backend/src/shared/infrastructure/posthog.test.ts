/**
 * Unit tests for the PostHog client wrapper.
 *
 * The test config never sets POSTHOG_API_KEY, so this exercises the
 * unconfigured/no-op path — the same path development and Render deploys
 * hit before the env var is set. captureEvent must never throw here.
 */
import { captureEvent, posthogClient, PostHogEvent } from './posthog'

describe('posthog', () => {
  it('does not create a client when POSTHOG_API_KEY is not configured', () => {
    expect(posthogClient).toBeNull()
  })

  it('captureEvent no-ops safely when the client is not configured', () => {
    expect(() =>
      captureEvent('user-1', PostHogEvent.UserSignedIn, { method: 'google' }),
    ).not.toThrow()
  })
})
