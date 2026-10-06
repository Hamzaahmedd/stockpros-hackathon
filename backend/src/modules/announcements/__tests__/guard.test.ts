import config from '@/config'
import { FeatureDisabledError } from '../../../shared/errors'
import { requireAnnouncementsEnabled } from '../guard'

const run = () => {
  const next = jest.fn()
  requireAnnouncementsEnabled({} as any, {} as any, next)
  return next
}

afterEach(() => {
  Object.assign(config.features, { enableAnnouncements: true })
})

describe('requireAnnouncementsEnabled', () => {
  it('lets the request through while the flag is on', () => {
    Object.assign(config.features, { enableAnnouncements: true })
    expect(run()).toHaveBeenCalledWith(undefined)
  })

  it('answers FeatureDisabledError while the flag is off', () => {
    Object.assign(config.features, { enableAnnouncements: false })
    expect(run().mock.calls[0][0]).toBeInstanceOf(FeatureDisabledError)
  })
})
