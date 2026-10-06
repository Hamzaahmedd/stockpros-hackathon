import { describe, expect, it } from 'vitest'
import { DomainAuthPolicy } from '@/modules/auth/types'
import { TeamJoinPolicy, type JoinOption } from './types'
import {
  AUTH_POLICY_LABELS,
  authPolicyChangedMessage,
  isDomainConfirmation,
  isStricterAuthPolicy,
  JOIN_POLICY_LABELS,
  joinActionLabel,
  parseJoinPolicy,
} from './utils'

const option = (joinPolicy: JoinOption['joinPolicy']): JoinOption => ({
  teamId: 'team-1',
  teamName: 'Alpha Fund',
  domain: 'fund.com',
  joinPolicy,
})

describe('joinActionLabel', () => {
  it('joins at once for auto-approve domains', () => {
    expect(joinActionLabel(option(TeamJoinPolicy.AUTO_APPROVE))).toBe(
      'Join Alpha Fund',
    )
  })

  it('asks to join when an admin must approve', () => {
    expect(joinActionLabel(option(TeamJoinPolicy.REQUEST_APPROVAL))).toBe(
      'Request to join Alpha Fund',
    )
  })
})

describe('parseJoinPolicy', () => {
  it.each(Object.values(TeamJoinPolicy))('accepts %s', (policy) => {
    expect(parseJoinPolicy(policy)).toBe(policy)
  })

  it('rejects anything else', () => {
    expect(parseJoinPolicy('OPEN_TO_ALL')).toBeUndefined()
    expect(parseJoinPolicy('')).toBeUndefined()
  })
})

describe('JOIN_POLICY_LABELS', () => {
  it('labels every policy for the dropdown', () => {
    expect(JOIN_POLICY_LABELS).toEqual({
      INVITE_ONLY: 'Invite only',
      REQUEST_APPROVAL: 'Require admin approval',
      AUTO_APPROVE: 'Auto-approve',
    })
  })
})

describe('domain auth policy helpers', () => {
  it('labels every policy', () => {
    expect(
      Object.values(DomainAuthPolicy).map((p) => AUTH_POLICY_LABELS[p]),
    ).toEqual(['Any method', 'Google sign-in only', 'Google Workspace only'])
  })

  it('treats everything but ANY as stricter', () => {
    expect(isStricterAuthPolicy(DomainAuthPolicy.ANY)).toBe(false)
    expect(isStricterAuthPolicy(DomainAuthPolicy.GOOGLE_ONLY)).toBe(true)
    expect(isStricterAuthPolicy(DomainAuthPolicy.GOOGLE_WORKSPACE)).toBe(true)
  })

  it('matches the typed domain ignoring case and surrounding spaces', () => {
    expect(isDomainConfirmation('  Fund.com ', 'fund.com')).toBe(true)
    expect(isDomainConfirmation('fund.co', 'fund.com')).toBe(false)
    expect(isDomainConfirmation('', 'fund.com')).toBe(false)
  })

  it('reports how many sessions were signed out', () => {
    expect(
      authPolicyChangedMessage('fund.com', DomainAuthPolicy.GOOGLE_ONLY, 1),
    ).toBe('fund.com: Google sign-in only. 1 session was signed out.')
    expect(authPolicyChangedMessage('fund.com', DomainAuthPolicy.ANY, 3)).toBe(
      'fund.com: Any method. 3 sessions were signed out.',
    )
  })
})
