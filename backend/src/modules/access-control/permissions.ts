export enum Action {
  WRITE = 'write',
  READ = 'read',
  DELETE = 'delete',
}

export enum Resource {
  CORE_APP = 'core_app',
  PORTFOLIO = 'portfolio',
  ACCESS_CONTROL = 'access_control',
  ROLE = 'role',
}

export const RESOURCE_ACTIONS: Readonly<Record<Resource, readonly Action[]>> = {
  [Resource.CORE_APP]: [Action.READ, Action.WRITE],
  [Resource.PORTFOLIO]: [Action.READ, Action.WRITE],
  [Resource.ACCESS_CONTROL]: [Action.READ],
  [Resource.ROLE]: [Action.READ, Action.WRITE, Action.DELETE],
}

export function isSupportedAction(resource: string, action: string): boolean {
  const actions = RESOURCE_ACTIONS[resource.toLowerCase() as Resource]
  return actions?.includes(action as Action) ?? false
}

export function hasReadForMutatingActions(actions: readonly string[]): boolean {
  const hasMutation = actions.some(
    (action) => action === Action.WRITE || action === Action.DELETE,
  )

  return !hasMutation || actions.includes(Action.READ)
}

export type Authority = `${Uppercase<string>}:${Uppercase<string>}`

export function toAuthority(resource: string, action: string): Authority {
  return `${resource.toUpperCase()}:${action.toUpperCase()}` as Authority
}
