export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
}

export enum Resource {
  PORTFOLIO = 'portfolio',
  ROLE = 'role',
}

export const permissionHierarchy: Record<Action, Action[]> = {
  [Action.CREATE]: [Action.READ, Action.CREATE],
  [Action.READ]: [Action.READ],
  [Action.UPDATE]: [Action.READ, Action.UPDATE],
  [Action.DELETE]: [Action.READ, Action.DELETE],
};