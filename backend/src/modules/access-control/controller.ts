import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../auth';
import {
  fetchAllPermissions,
  fetchAllResources,
  fetchAllRoles,
  fetchAllScreenPermissions,
  fetchAllUsers,
  grantRole,
  unassignRole,
  createRole,
  assignPermissions,
  revokePermissions,
  grantActionsToResources,
} from './service';
import { getUserId, sendSuccess } from '../../shared/utils';
import { validateOrThrow } from '../../shared/errors';
import {
  revokeRoleValidator,
  assignPermissionsValidator,
  assignActionsValidator,
  createRoleValidator,
  assignRoleValidator,
  getUsersQueryValidator,
} from './validation';

export async function getUserScreenPermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const callerId = getUserId(req);
    const allPermissions = await fetchAllScreenPermissions(callerId);

    const message = Object.keys(allPermissions).length === 0
      ? 'No permissions assigned to any resource.'
      : 'Screen permissions fetched successfully for all resources';

    return sendSuccess(res, {
      message,
      data: allPermissions,
    });
  } catch (error: any) {
    next(error);
  }
}

export const getAllUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const query = validateOrThrow(getUsersQueryValidator, req.query);
    const result = await fetchAllUsers(query);

    sendSuccess(res, {
      message: 'Users retrieved successfully.',
      data: result.data,
      extra: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const assignedRole = await fetchAllPermissions();

    sendSuccess(res, {
      message: 'Permissions retrieved successfully.',
      data: assignedRole,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllRoles = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await fetchAllRoles();

    sendSuccess(res, {
      message: 'Roles retrieved successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllResources = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await fetchAllResources();

    sendSuccess(res, {
      message: 'Resources retrieved successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const assignRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const callerId = getUserId(req);
    const { userId, roleIds } = validateOrThrow(assignRoleValidator, req.body);
    const assignedRole = await grantRole({ userId, roleIds, callerId });

    sendSuccess(res, {
      message: 'Role assigned successfully',
      data: assignedRole,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const callerId = getUserId(req);
    const { userId, roleId } = validateOrThrow(revokeRoleValidator, req.body);

    await unassignRole({
      userId,
      roleId,
      revokedByUserId: callerId,
    });

    return sendSuccess(res, {
      message: 'Role revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

export async function addRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { name, description } = validateOrThrow(createRoleValidator, req.body);
    const role = await createRole({ name, description });

    sendSuccess(res, {
      statusCode: 201,
      message: 'Role added successfully',
      data: role,
    });
  } catch (error) {
    next(error);
  }
}

export const assignPermissionsToRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const callerId = getUserId(req);
    const { roleId, permissions } = validateOrThrow(assignPermissionsValidator, req.body);
    const permissionsAssigned = await assignPermissions({
      roleId,
      permissions,
      callerId,
    });

    return sendSuccess(res, {
      message: 'Permissions assigned successfully',
      data: permissionsAssigned,
    });
  } catch (error) {
    next(error);
  }
};

export const revokePermissionsFromRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const callerId = getUserId(req);
    const { roleId, permissions } = validateOrThrow(assignPermissionsValidator, req.body);

    await revokePermissions({
      roleId,
      permissions,
      callerId,
    });

    return sendSuccess(res, {
      message: 'Permissions revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const assignActionsToResources = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { resources } = validateOrThrow(assignActionsValidator, req.body);
    const result = await grantActionsToResources(resources);

    const message = Object.keys(result).length === 0
      ? 'No new permissions assigned (all already exist).'
      : 'Actions successfully assigned to resources.';

    return sendSuccess(res, {
      statusCode: 201,
      message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
