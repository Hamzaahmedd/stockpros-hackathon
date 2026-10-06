import { describe, expect, it } from 'vitest'
import { diffPermissions, missingActions } from './utils'

describe('diffPermissions', () => {
  it('reports nothing when the matrix is unchanged', () => {
    const same = { core_app: ['read', 'write'], role: ['read'] }
    expect(diffPermissions(same, { ...same })).toEqual({
      added: [],
      removed: [],
    })
  })

  it('separates what was ticked from what was unticked, per resource', () => {
    const before = { core_app: ['read', 'write'], role: ['read'] }
    const after = { core_app: ['read'], role: ['read', 'write'] }

    expect(diffPermissions(before, after)).toEqual({
      added: [{ resourceName: 'role', actions: ['write'] }],
      removed: [{ resourceName: 'core_app', actions: ['write'] }],
    })
  })

  it('treats a resource that appears or disappears as all-added or all-removed', () => {
    expect(
      diffPermissions({ portfolio: ['read'] }, { core_app: ['read'] }),
    ).toEqual({
      added: [{ resourceName: 'core_app', actions: ['read'] }],
      removed: [{ resourceName: 'portfolio', actions: ['read'] }],
    })
  })

  it('lets a role be emptied completely, which needs only the revoke call', () => {
    expect(diffPermissions({ core_app: ['read'] }, { core_app: [] })).toEqual({
      added: [],
      removed: [{ resourceName: 'core_app', actions: ['read'] }],
    })
  })
})

describe('missingActions', () => {
  it('lists supported actions that have no permission row yet', () => {
    expect(missingActions('role', ['read'])).toEqual(['write', 'delete'])
  })

  it('matches the resource name case-insensitively', () => {
    expect(missingActions('ROLE', ['read', 'write', 'delete'])).toEqual([])
    expect(missingActions('CORE_APP', [])).toEqual(['read', 'write'])
  })

  it('offers nothing for a resource the server does not know', () => {
    expect(missingActions('mystery', [])).toEqual([])
  })
})
