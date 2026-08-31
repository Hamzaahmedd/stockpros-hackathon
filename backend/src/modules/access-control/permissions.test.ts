/**
 * Unit tests for the permission hierarchy.
 *
 * Strategy (Black-Box): Assert that each Action key implies the correct
 * set of allowed Actions, enforcing the RBAC contract without coupling to
 * the hierarchy's internal data structure.
 */
import {
  Action,
  permissionHierarchy,
} from '../../modules/access-control/permissions'

describe('permissionHierarchy', () => {
  it('READ action only implies READ', () => {
    const implied = permissionHierarchy[Action.READ]
    expect(implied).toEqual(expect.arrayContaining([Action.READ]))
    expect(implied).not.toContain(Action.CREATE)
    expect(implied).not.toContain(Action.UPDATE)
    expect(implied).not.toContain(Action.DELETE)
  })

  it('CREATE action implies READ and CREATE', () => {
    const implied = permissionHierarchy[Action.CREATE]
    expect(implied).toEqual(
      expect.arrayContaining([Action.READ, Action.CREATE]),
    )
    expect(implied).not.toContain(Action.UPDATE)
    expect(implied).not.toContain(Action.DELETE)
  })

  it('UPDATE action implies READ and UPDATE (not CREATE or DELETE)', () => {
    const implied = permissionHierarchy[Action.UPDATE]
    expect(implied).toEqual(
      expect.arrayContaining([Action.READ, Action.UPDATE]),
    )
    expect(implied).not.toContain(Action.CREATE)
    expect(implied).not.toContain(Action.DELETE)
  })

  it('DELETE action implies READ and DELETE (not CREATE or UPDATE)', () => {
    const implied = permissionHierarchy[Action.DELETE]
    expect(implied).toEqual(
      expect.arrayContaining([Action.READ, Action.DELETE]),
    )
    expect(implied).not.toContain(Action.CREATE)
    expect(implied).not.toContain(Action.UPDATE)
  })

  it('every Action key is covered in the hierarchy (no gaps)', () => {
    const actions = Object.values(Action)
    for (const action of actions) {
      expect(permissionHierarchy[action]).toBeDefined()
    }
  })

  it('every implied action is itself a valid Action enum value', () => {
    const validActions = new Set(Object.values(Action))
    for (const [, implied] of Object.entries(permissionHierarchy)) {
      for (const a of implied) {
        expect(validActions.has(a as Action)).toBe(true)
      }
    }
  })
})
