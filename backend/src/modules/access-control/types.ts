export interface CreateRoleParams {
  name: string;
  description: string;
}

export interface GrantRoleParams {
  userId: string; 
  roleIds: string[]; 
  callerId: string; 
}

export interface RevokeRoleParams {
  userId: string;
  roleId: string;
  revokedByUserId: string;
}

export interface PermissionInput {
  resourceName: string;
  actions: string[]; // list of actions like 'read', 'write', etc.
}

export interface AssignPermissionsParams {
  roleId: string;
  permissions: PermissionInput[];
  callerId: string;
}

export interface ScreenPermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canManage: boolean;
}