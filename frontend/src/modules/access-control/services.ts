import api from '@/shared/api/axios'
import type { Permission, Resource, Role, RolePermission } from './types'

export type { Permission, Resource } from './types'

export const rbacService = {
  getResources: async (): Promise<Resource[]> => {
    const response = await api.get('/api/v1/rbac/resources')
    return response.data.data || response.data
  },

  getPermissions: async (): Promise<Permission[]> => {
    const response = await api.get('/api/v1/rbac/permissions')
    return response.data.data || response.data
  },

  getRoles: async () => {
    const response = await api.get('/api/v1/rbac/roles')
    return response.data.data || response.data
  },

  getUsers: async () => {
    const response = await api.get('/api/v1/rbac/users')
    return response.data.data || response.data
  },

  /** `name` must be ALL_CAPS_SNAKE_CASE; the server rejects anything else. */
  createRole: async (name: string, description: string): Promise<Role> => {
    const response = await api.post('/api/v1/rbac/roles', { name, description })
    return response.data.data || response.data
  },

  /** Adds permissions to a role; it never removes any (see revokePermissions). */
  assignPermissions: async (
    roleId: string,
    permissions: RolePermission[],
  ): Promise<void> => {
    await api.post('/api/v1/rbac/assign-permissions', { roleId, permissions })
  },

  /** Removes permissions from a role. The server refuses to leave write/delete without read. */
  revokePermissions: async (
    roleId: string,
    permissions: RolePermission[],
  ): Promise<void> => {
    await api.delete('/api/v1/rbac/revoke-permissions', {
      data: { roleId, permissions },
    })
  },

  /** Creates the permission rows for actions a resource supports but does not have yet. */
  enableActions: async (
    resources: { name: string; actions: string[] }[],
  ): Promise<void> => {
    await api.post('/api/v1/rbac/resource-mappings', { resources })
  },

  /** Replaces the user's whole role set; at least one role is required. */
  assignRoles: async (userId: string, roleIds: string[]) => {
    const response = await api.post('/api/v1/rbac/assign-role', {
      userId,
      roleIds,
    })
    return response.data.data || response.data
  },

  /** Removes one role from one user (the only way to take away their last role). */
  revokeRoleFromUser: async (userId: string, roleId: string): Promise<void> => {
    await api.delete(`/api/v1/rbac/roles/${roleId}`, {
      data: { userId, roleId },
    })
  },
}
