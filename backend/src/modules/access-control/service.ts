// Consolidated rbac service
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../shared/errors";
import { GrantRoleParams, RevokeRoleParams, AssignPermissionsParams, CreateRoleParams } from "./types";
import { RoleName } from "@prisma/client";
import { prisma } from "../../shared/infrastructure/database";
import { Action, Resource, permissionHierarchy } from "./permissions";
import { deleteCache, getCache, setCache } from "../../shared/infrastructure/cache";
import { ScreenPermissions } from "./types";

// ── Role Management ──
export async function grantRole(params: GrantRoleParams) {
  const { userId, roleIds, callerId } = params

  await deleteCache(`user:${userId}:screens:effective:all`);

  return prisma.$transaction(async (tx) => {
    const [targetUser, rolesToAssign] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } }),
      tx.role.findMany({ where: { id: { in: roleIds } } }),
    ])

    if (!targetUser) throw new NotFoundError('Target User not found')
    if (rolesToAssign.length !== roleIds.length) {
      throw new NotFoundError('One or more selected Role IDs are invalid.')
    }

    const currentUserRoles = await tx.userRole.findMany({
      where: { userId },
      include: { role: true }
    });

    const wasAdmin = currentUserRoles.some((ur) => ur.role.name === RoleName.ADMIN);
    const willBeAdmin = rolesToAssign.some((r) => r.name === RoleName.ADMIN);

    if (wasAdmin && !willBeAdmin) {
      throw new ForbiddenError('You cannot strip the admin role from another admin.');
    }

    await tx.userRole.deleteMany({
      where: { userId }
    });

    await tx.userRole.createMany({
      data: roleIds.map(roleId => ({
        userId,
        roleId,
        assignedById: callerId,
      }))
    });

    const finalAssignments = await tx.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: { id: true, name: true }
        }
      }
    });

    return {
      userId: targetUser.id,
      userName: targetUser.displayName,
      roles: finalAssignments.map((a) => a.role)
    };
  });
}

export async function unassignRole(params: RevokeRoleParams) {
  const { userId, roleId, revokedByUserId } = params

  await deleteCache(`user:${userId}:screens:effective:all`);

  return prisma.$transaction(async (tx) => {
    const [role, revoker, targetUser] = await Promise.all([
      tx.role.findUnique({ where: { id: roleId } }),
      tx.user.findUnique({ where: { id: revokedByUserId } }),
      tx.user.findUnique({ where: { id: userId } }),
    ])

    if (!role || !revoker || !targetUser) {
      throw new NotFoundError('roleId, revokedByUserId, or userId not found')
    }

    const revokerHasAdminRole = await tx.userRole.findFirst({
      where: {
        userId: revokedByUserId,
        role: { name: RoleName.ADMIN },
      },
      include: { role: true },
    })

    if (!revokerHasAdminRole) {
      throw new UnauthorizedError('Only admins can revoke roles')
    }

    const userRole = await tx.userRole.findFirst({
      where: { userId, roleId },
    })

    if (!userRole) {
      throw new NotFoundError('The user does not have this role assigned')
    }

    return tx.userRole.delete({ where: { id: userRole.id } })
  })
}

export async function createRole(params: CreateRoleParams) {
  const { name, description } = params;

  return prisma.role.create({
    data: {
      name: name.toUpperCase(),
      description
    },
  });
}

// ── Permission Management ──
export async function assignPermissions(params: AssignPermissionsParams) {
  const { roleId, permissions } = params;

  const [role, existingResources] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId } }),
    prisma.resource.findMany({
      where: { name: { in: permissions.map((p) => p.resourceName) } },
    }),
  ]);

  if (!role) throw new NotFoundError('Target Role not found');
  if (role.name === RoleName.ADMIN) {
    throw new ForbiddenError('The permissions for the ADMIN role are locked and cannot be modified via the API.');
  }

  const resourceMap = Object.fromEntries(
    existingResources.map((r) => [r.name, r.id])
  );

  const processedFlatData = permissions.flatMap((p) => {
    const resourceId = resourceMap[p.resourceName];
    if (!resourceId) throw new NotFoundError(`Resource ${p.resourceName} not found`);

    let actions = [...p.actions];

    const hasModifyingActions = actions.some((a) =>
      [Action.CREATE, Action.UPDATE, Action.DELETE].includes(a as Action)
    );

    if (hasModifyingActions && !actions.includes(Action.READ)) {
      actions.push(Action.READ);
    }

    if (!actions.includes(Action.READ)) {
      return [];
    }

    return actions.map((action) => ({
      action: action as Action,
      resourceId,
    }));
  });

  return await prisma.$transaction(async (tx) => {
    if (processedFlatData.length > 0) {
      await tx.permission.createMany({
        data: processedFlatData,
        skipDuplicates: true,
      });
    }

    await tx.rolePermission.deleteMany({
      where: { roleId },
    });

    if (processedFlatData.length > 0) {
      const dbPermissions = await tx.permission.findMany({
        where: {
          OR: processedFlatData.map((p) => ({
            action: p.action,
            resourceId: p.resourceId,
          })),
        },
      });

      const rolePermissionData = dbPermissions.map((p) => ({
        roleId,
        permissionId: p.id,
      }));

      await tx.rolePermission.createMany({
        data: rolePermissionData,
      });
    }

    const finalAssigned = await tx.rolePermission.findMany({
      where: { roleId },
      select: {
        permissionId: true,
        permission: {
          select: {
            action: true,
            resource: { select: { name: true } },
          },
        },
      },
    });

    return {
      roleId: role.id,
      roleName: role.name,
      permissions: finalAssigned.map((item) => ({
        id: item.permissionId,
        action: item.permission.action,
        resource: item.permission.resource.name,
      })),
    }
  }, { timeout: 10000 });
}

export async function revokePermissions(params: AssignPermissionsParams) {
  const { roleId, permissions, callerId } = params;

  const resourceNames = permissions.map(p => p.resourceName);
  const resources = await prisma.resource.findMany({
    where: { name: { in: resourceNames } },
  });
  const resourceMap = Object.fromEntries(resources.map((r) => [r.name, r]));

  for (const p of permissions) {
    if (!resourceMap[p.resourceName]) {
      throw new NotFoundError(`Resource "${p.resourceName}" does not exist`);
    }
  }

  const [role, grantor] = await Promise.all([
    prisma.role.findUnique({
      where: { id: roleId },
    }),
    prisma.user.findUnique({ where: { id: callerId } }),
  ]);

  if (!role) throw new NotFoundError("Role not found");
  if (!grantor) throw new NotFoundError("Grantor user not found");

  const rolePermissionWhereList: { roleId: string; permissionId: string }[] = [];

  for (const p of permissions) {
    const resource = resourceMap[p.resourceName];
    for (const action of p.actions) {
      const permission = await prisma.permission.findUnique({
        where: { action_resourceId: { action, resourceId: resource.id } },
      });
      if (permission) {
        rolePermissionWhereList.push({ roleId, permissionId: permission.id });
      }
    }
  }

  if (rolePermissionWhereList.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const link of rolePermissionWhereList) {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: link.roleId,
          permissionId: link.permissionId,
        },
      });
    }
  });
}

export async function grantActionsToResources(
  resourcesInput: { name: string; actions: string[] }[]
) {
  return prisma.$transaction(async (tx) => {
    const results: Record<string, string[]> = {};

    for (const { name, actions } of resourcesInput) {
      const resource = await tx.resource.findUnique({
        where: { name },
        select: { id: true },
      });

      if (!resource) {
        throw new NotFoundError(`Resource '${name}' not found`);
      }

      results[name] = [];

      for (const action of actions) {
        const existing = await tx.permission.findUnique({
          where: {
            action_resourceId: {
              action,
              resourceId: resource.id,
            },
          },
        });

        if (!existing) {
          await tx.permission.create({
            data: {
              action,
              resourceId: resource.id,
            },
          });
          results[name].push(action);
        }
      }
    }

    return results;
  });
}

// ── Permission Checking ──
export async function fetchAllScreenPermissions(
  userId: string,
): Promise<Record<string, Partial<ScreenPermissions>>> {
  const cacheKey = `user:${userId}:screens:effective:all`
  const cached = await getCache<Record<string, Partial<ScreenPermissions>>>(cacheKey)
  if (cached) return cached

  const userRole = await prisma.userRole.findFirst({
    where: { userId },
    select: { roleId: true },
  })

  if (!userRole) {
    await setCache(cacheKey, {}, 60)
    return {}
  }

  const resources = await prisma.resource.findMany({
    select: { id: true, name: true },
  })

  const result: Record<string, Partial<ScreenPermissions>> = {}

  for (const resource of resources) {
    const allowedActions = await getUserPermissions(userId, resource.name as Resource)

    const allowed = {
      canRead: allowedActions.some((a) =>
        permissionHierarchy[a as Action].includes(Action.READ),
      ),
      canCreate: allowedActions.some((a) =>
        permissionHierarchy[a as Action].includes(Action.CREATE),
      ),
      canUpdate: allowedActions.some((a) =>
        permissionHierarchy[a as Action].includes(Action.UPDATE),
      ),
      canArchive: allowedActions.some((a) =>
        permissionHierarchy[a as Action].includes(Action.DELETE),
      ),
    }

    const screen = await prisma.screen.findFirst({
      where: { roleId: userRole.roleId, resourceId: resource.id },
      select: {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canArchive: true,
      },
    })

    const isRead = Boolean(allowed.canRead || screen?.canRead)

    if (!isRead) continue

    const combined: Partial<ScreenPermissions> = {
      canRead: true,
      ...(allowed.canCreate || screen?.canCreate ? { canCreate: true } : {}),
      ...(allowed.canUpdate || screen?.canUpdate ? { canUpdate: true } : {}),
      ...(allowed.canArchive || screen?.canArchive ? { canArchive: true } : {}),
    }

    result[resource.name] = combined
  }

  await setCache(cacheKey, result, 60)
  return result
}

export async function checkPermission(
  userId: string | undefined,
  resourceName: Resource,
  action: Action
): Promise<boolean> {
  const userActions = await getUserPermissions(userId, resourceName);
  return userActions.some((a) => permissionHierarchy[a as Action].includes(action));
}

export async function getUserPermissions(
  userId: string | undefined,
  resourceName: Resource
): Promise<Action[]> {
  const cacheKey = `user:${userId}:resource:${resourceName}`;
  const cached = await getCache<Action[]>(cacheKey);
  if (cached) return cached;

  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  const roleIds = userRoles.map((r) => r.roleId);
  if (!roleIds.length) return [];

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    include: { permission: { include: { resource: true } } },
  });

  let allowedActions: Action[] = [];
  rolePermissions.forEach((rp) => {
    if (rp.permission.resource.name === resourceName) {
      allowedActions.push(rp.permission.action as Action);
    }
  });

  const userPermissions = await prisma.userPermission.findMany({
    where: { userId },
    include: { permission: { include: { resource: true } } },
  });

  userPermissions.forEach((up) => {
    if (up.permission.resource.name === resourceName) {
      allowedActions.push(up.permission.action as Action);
    }
  });

  allowedActions = Array.from(new Set(allowedActions));

  await setCache(cacheKey, allowedActions, 60);

  return allowedActions;
}

// ── Data Fetching ──
export async function fetchAllUsers(query: { cursor?: string; limit?: number } = {}) {
  const { cursor, limit = 20 } = query;

  let cursorCreatedAt: Date | undefined;
  if (cursor) {
    const cursorRow = await prisma.user.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    });
    if (cursorRow) {
      cursorCreatedAt = cursorRow.createdAt;
    }
  }

  const rows = await prisma.user.findMany({
    where: {
      ...(cursorCreatedAt && {
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { createdAt: cursorCreatedAt, id: { lt: cursor } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      displayName: true,
      email: true,
      status: true,
      createdAt: true,
      userRoles: {
        select: {
          role: {
            select: { id: true, name: true, description: true },
          },
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  const total = await prisma.user.count();

  return {
    data,
    nextCursor,
    hasMore,
    total,
  };
}

export async function fetchAllRoles() {
  const roles = await prisma.role.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: {
        select: { userRoles: true },
      },
      rolePermissions: {
        select: {
          permission: {
            select: {
              action: true,
              resource: {
                select: { name: true }
              }
            }
          }
        }
      }
    },
  })

  const formattedRoles = roles.map((role) => ({
    ...role,
    userCount: role._count.userRoles,
    _count: undefined,
  }))

  if (!roles.length) {
    throw new NotFoundError('No roles found')
  }

  return formattedRoles
}

export async function fetchAllPermissions() {
  const permissions = await prisma.permission.findMany({
    orderBy: {
      action: 'asc',
    },
    select: {
      id: true,
      action: true,
      resourceId: true,
      resource: {
        select: { name: true },
      },
    },
  })

  if (!permissions.length) {
    throw new NotFoundError('No permissions found')
  }

  return permissions
}

export async function fetchAllResources() {
  const resources = await prisma.resource.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  })

  if (!resources.length) {
    throw new NotFoundError('No resources found')
  }

  return resources
}
