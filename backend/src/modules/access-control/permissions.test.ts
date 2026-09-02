/**
 * Unit tests for the permission authority contract.
 *
 * Strategy (Black-Box): Assert that each Action key implies the correct
 * authority format, enforcing the RBAC contract without coupling to storage.
 */
import { toAuthority } from '../../modules/access-control/permissions'

describe('toAuthority', () => {
  it('normalizes resource and action into an exact authority', () => {
    expect(toAuthority('role', 'delete')).toBe('ROLE:DELETE')
    expect(toAuthority('Portfolio', 'READ')).toBe('PORTFOLIO:READ')
  })
})
