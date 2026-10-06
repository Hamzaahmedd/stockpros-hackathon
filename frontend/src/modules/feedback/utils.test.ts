import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_APP_VERSION_LENGTH,
  MAX_USER_AGENT_LENGTH,
  collectFeedbackContext,
} from './utils'

const setWindow = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })
}

const setUserAgent = (value: string) =>
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(value)

afterEach(() => {
  vi.restoreAllMocks()
  setWindow(1024, 768)
})

describe('collectFeedbackContext', () => {
  it('reports the browser, the window size and the build', () => {
    setUserAgent('Mozilla/5.0 (Test)')
    setWindow(1440.4, 900.6)

    const context = collectFeedbackContext()

    expect(context.userAgent).toBe('Mozilla/5.0 (Test)')
    expect(context.viewport).toEqual({ width: 1440, height: 901 })
    // Injected from package.json by vite.config.ts.
    expect(context.appVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('never reports a plan: the server reads it from the session', () => {
    expect(collectFeedbackContext()).not.toHaveProperty('planTier')
  })

  it('trims a long user agent to the limit the API accepts', () => {
    setUserAgent(`  ${'x'.repeat(MAX_USER_AGENT_LENGTH + 50)}`)
    expect(collectFeedbackContext().userAgent).toHaveLength(
      MAX_USER_AGENT_LENGTH,
    )
    expect(MAX_APP_VERSION_LENGTH).toBe(40)
  })

  it('omits what it cannot read', () => {
    setUserAgent('   ')
    setWindow(0, 0)

    const context = collectFeedbackContext()

    expect(context).not.toHaveProperty('userAgent')
    expect(context).not.toHaveProperty('viewport')
  })

  it('keeps an absurd window size inside the API bounds', () => {
    setWindow(99_999, 0.2)
    expect(collectFeedbackContext().viewport).toEqual({
      width: 20_000,
      height: 1,
    })
  })

  it('omits a viewport that is not a number', () => {
    setWindow(Number.NaN, 700)
    expect(collectFeedbackContext()).not.toHaveProperty('viewport')
  })
})
