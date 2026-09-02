/**
 * Unit tests for the permission authority contract.
 *
 * Strategy (Black-Box): Assert that each Action key implies the correct
 * authority format, enforcing the RBAC contract without coupling to storage.
 */
import {
  Action,
  hasReadForMutatingActions,
  isSupportedAction,
  Resource,
  toAuthority,
} from '../../modules/access-control/permissions'

describe('toAuthority', () => {
  it('normalizes resource and action into an exact authority', () => {
    expect(toAuthority('role', 'delete')).toBe('ROLE:DELETE')
    expect(toAuthority('Portfolio', 'READ')).toBe('PORTFOLIO:READ')
  })
})

describe('role permission matrix invariants', () => {
  it('requires read whenever write or delete is assigned', () => {
    expect(hasReadForMutatingActions([Action.READ, Action.WRITE])).toBe(true)
    expect(hasReadForMutatingActions([Action.READ, Action.DELETE])).toBe(true)
    expect(hasReadForMutatingActions([Action.WRITE])).toBe(false)
    expect(hasReadForMutatingActions([Action.DELETE])).toBe(false)
  })
})

describe('resource action catalog', () => {
  it('separates standard app, portfolio, and access-control boundaries', () => {
    expect(isSupportedAction(Resource.CORE_APP, Action.READ)).toBe(true)
    expect(isSupportedAction(Resource.CORE_APP, Action.WRITE)).toBe(true)
    expect(isSupportedAction(Resource.PORTFOLIO, Action.READ)).toBe(true)
    expect(isSupportedAction(Resource.ACCESS_CONTROL, Action.READ)).toBe(true)
  })

  it('does not grant unsupported actions through the catalog', () => {
    expect(isSupportedAction(Resource.ACCESS_CONTROL, Action.WRITE)).toBe(false)
    expect(isSupportedAction(Resource.PORTFOLIO, Action.DELETE)).toBe(false)
  })
})
