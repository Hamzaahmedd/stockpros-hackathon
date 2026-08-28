import type { UserRoleEntry } from '../auth/types';

export type { UserRoleEntry };

export interface Resource {
  id: string;
  name: string;
  description?: string;
  actions?: string[];
}

export interface Permission {
  id?: string;
  action: string;
  resourceId?: string;
  roleId?: string;
  resource?: {
    name?: string;
  };
}

/** A permission assignment attached to a role, tolerant of joined API shapes. */
export interface RolePermissionEntry {
  roleId?: string;
  permission?: {
    id?: string;
    action?: string;
    resource?: {
      name?: string;
    };
  };
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  rolePermissions?: RolePermissionEntry[];
}

export interface RolePermission {
  resourceName: string;
  actions: string[];
}

export interface AccessControlUser {
  id: string;
  displayName: string;
  email: string;
  status: string;
  userRoles: UserRoleEntry[];
}
