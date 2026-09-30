jest.mock('../../auth', () => ({
  authTokenMiddleware: jest.fn(),
}))

jest.mock('../controller', () => {
  const names = [
    'createTeam',
    'getMyTeam',
    'listMembers',
    'addSeats',
    'createInvite',
    'acceptInvite',
    'removeMember',
    'setMemberCreditLimit',
    'addDomain',
    'verifyDomain',
    'updateInstructions',
    'getPreferences',
    'updateMyPreferences',
    'updateWorkspacePreferences',
    'getAnalytics',
    'search',
    'listWatchlists',
    'createWatchlist',
    'deleteWatchlist',
    'listScreeners',
    'createScreener',
    'deleteScreener',
    'listNotes',
    'createNote',
    'deleteNote',
  ]
  return Object.fromEntries(names.map((n) => [n, jest.fn()]))
})

import router from '../routes'
import { teamsModule } from '../index'

interface Layer {
  route?: { path: string; methods: Record<string, boolean> }
}

const registered = (router as unknown as { stack: Layer[] }).stack
  .filter((layer) => layer.route)
  .map((layer) => {
    const { path, methods } = layer.route!
    return `${Object.keys(methods)[0].toUpperCase()} ${path}`
  })

describe('teams router', () => {
  it.each([
    'POST /',
    'GET /me',
    'POST /seats/add',
    'POST /invites',
    'POST /invites/accept',
    'DELETE /members/:userId',
    'PATCH /members/:userId/credit-limit',
    'POST /domains',
    'POST /domains/verify',
    'GET /members',
    'PATCH /instructions',
    'GET /preferences',
    'PATCH /preferences',
    'PATCH /preferences/workspace',
    'GET /analytics',
    'GET /search',
    'GET /watchlists',
    'POST /watchlists',
    'DELETE /watchlists/:id',
    'GET /screeners',
    'POST /screeners',
    'DELETE /screeners/:id',
    'GET /notes',
    'POST /notes',
    'DELETE /notes/:id',
  ])('registers %s', (route) => {
    expect(registered).toContain(route)
  })

  it('registers exactly the expected number of routes', () => {
    expect(registered).toHaveLength(25)
  })

  it('applies the auth middleware before any route', () => {
    const stack = (router as unknown as { stack: Layer[] }).stack
    expect(stack[0].route).toBeUndefined()
  })
})

describe('teamsModule', () => {
  it('exposes the module contract', () => {
    expect(teamsModule.name).toBe('teams')
    expect(teamsModule.route).toBe('/api/v1/teams')
    expect(teamsModule.router).toBe(router)
    expect(Object.isFrozen(teamsModule)).toBe(true)
  })
})
