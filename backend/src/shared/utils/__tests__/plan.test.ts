import { hasPaidPlan } from '../plan'

describe('hasPaidPlan', () => {
  it.each([
    ['PRO', true],
    ['TEAM', true],
    ['FREE', false],
    [undefined, false],
  ] as const)('%s => %s', (plan, expected) => {
    expect(hasPaidPlan(plan)).toBe(expected)
  })
})
