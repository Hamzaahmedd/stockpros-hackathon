export enum Action {
  WRITE = 'write',
  READ = 'read',
  EDIT = 'edit',
  DELETE = 'delete',
}

export enum Resource {
  PORTFOLIO = 'portfolio',
  ROLE = 'role',
}

export type Authority = `${Uppercase<string>}:${Uppercase<string>}`

export function toAuthority(resource: string, action: string): Authority {
  return `${resource.toUpperCase()}:${action.toUpperCase()}` as Authority
}
