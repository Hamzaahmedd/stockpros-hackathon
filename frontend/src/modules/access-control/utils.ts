import { RESOURCE_ACTIONS } from './constants'
import type { RolePermission } from './types'

/** resource name -> the actions a role holds on it. */
export type PermissionSelection = Record<string, string[]>

const toList = (selection: PermissionSelection): RolePermission[] =>
  Object.entries(selection)
    .filter(([, actions]) => actions.length > 0)
    .map(([resourceName, actions]) => ({ resourceName, actions }))

/**
 * What saving the permission matrix has to do. The assign endpoint only adds
 * and the revoke endpoint only removes, so an edit is the difference between
 * what the role had when the dialog opened and what is ticked now.
 */
export const diffPermissions = (
  before: PermissionSelection,
  after: PermissionSelection,
): { added: RolePermission[]; removed: RolePermission[] } => {
  const added: PermissionSelection = {}
  const removed: PermissionSelection = {}
  const resources = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const resource of resources) {
    const had = before[resource] ?? []
    const has = after[resource] ?? []
    added[resource] = has.filter((action) => !had.includes(action))
    removed[resource] = had.filter((action) => !has.includes(action))
  }
  return { added: toList(added), removed: toList(removed) }
}

/** Actions a resource supports that have no permission row yet, so they cannot be granted until enabled. */
export const missingActions = (
  resourceName: string,
  defined: readonly string[],
): string[] =>
  (RESOURCE_ACTIONS[resourceName.toLowerCase()] ?? []).filter(
    (action) => !defined.includes(action),
  )
