import type { AuthenticatedRequest } from '../../../modules/auth/types'
import { orgContextExtra } from '../org-context'

const reqWith = (teamContext?: unknown) =>
  ({ teamContext }) as unknown as AuthenticatedRequest

describe('orgContextExtra', () => {
  it('returns orgContext when the member has org instructions', () => {
    const req = reqWith({
      membership: { orgInstructions: 'Be concise' },
      priority: 'NORMAL',
    })
    expect(orgContextExtra(req)).toEqual({ orgContext: 'Be concise' })
  })

  it('returns an empty object without team context', () => {
    expect(orgContextExtra(reqWith())).toEqual({})
  })

  it('returns an empty object for a null membership', () => {
    expect(orgContextExtra(reqWith({ membership: null }))).toEqual({})
  })

  it('returns an empty object for empty or null instructions', () => {
    expect(
      orgContextExtra(reqWith({ membership: { orgInstructions: '' } })),
    ).toEqual({})
    expect(
      orgContextExtra(reqWith({ membership: { orgInstructions: null } })),
    ).toEqual({})
  })
})
