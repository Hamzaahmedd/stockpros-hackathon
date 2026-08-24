export interface Resource {
  id: string;
  name: string;
  description?: string;
  actions?: string[];
}

export interface Permission {
  id: string;
  action: string;
  resourceId: string;
  resource: {
    name: string;
  };
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  rolePermissions?: any[];
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
  userRoles: { role: { name: string } }[];
}
