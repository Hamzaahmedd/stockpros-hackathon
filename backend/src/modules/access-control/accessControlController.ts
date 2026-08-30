import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
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
} from './service'
import { getUserId } from '../../shared/utils'
import { PermissionInput } from './types'

export interface AccessControlResponse<T = any> {
  success: boolean
  message: string
  data?: T
  nextCursor?: string | null
  hasMore?: boolean
  total?: number
}

export interface AssignRoleBody {
  userId: string
  roleIds: string[]
}

export interface RevokeRoleBody {
  userId: string
  roleId: string
}

export interface CreateRoleBody {
  name: string
  description: string
}

export interface AssignPermissionsBody {
  roleId: string
  permissions: PermissionInput[]
}

export interface AssignActionsResourceItem {
  name: string
  actions: string[]
}

export interface AssignActionsBody {
  resources: AssignActionsResourceItem[]
}

@Tags('Access Control (RBAC)')
@Route('api/v1/rbac')
export class AccessControlController extends Controller {
  /**
   * Get effective screen permissions for the authenticated caller.
   */
  @Get('user-screens')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getUserScreenPermissions(
    @Request() req: ExpressRequest,
  ): Promise<AccessControlResponse<any>> {
    const callerId = getUserId(req)
    const allPermissions = await fetchAllScreenPermissions(callerId)
    const message =
      Object.keys(allPermissions).length === 0
        ? 'No permissions assigned to any resource.'
        : 'Screen permissions fetched successfully for all resources'
    return {
      success: true,
      message,
      data: allPermissions,
    }
  }

  /**
   * Get all users with paginated list (Admin/RBAC read).
   */
  @Get('users')
  @Security('bearerAuth', ['ROLE:READ'])
  @SuccessResponse(200, 'Success')
  public async getAllUsers(
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<AccessControlResponse<any>> {
    const result = await fetchAllUsers({
      cursor,
      limit: limit ?? 20,
    })
    return {
      success: true,
      message: 'Users retrieved successfully.',
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      total: result.total,
    }
  }

  /**
   * Get all roles defined in the system.
   */
  @Get('roles')
  @Security('bearerAuth', ['ROLE:READ'])
  @SuccessResponse(200, 'Success')
  public async getAllRoles(): Promise<AccessControlResponse<any>> {
    const result = await fetchAllRoles()
    return {
      success: true,
      message: 'Roles retrieved successfully.',
      data: result,
    }
  }

  /**
   * Create a new role in the system.
   */
  @Post('roles')
  @Security('bearerAuth', ['ROLE:CREATE'])
  @SuccessResponse(201, 'Created')
  public async addRole(
    @Body() body: CreateRoleBody,
  ): Promise<AccessControlResponse<any>> {
    const role = await createRole(body)
    this.setStatus(201)
    return {
      success: true,
      message: 'Role added successfully',
      data: role,
    }
  }

  /**
   * Revoke a role from a user.
   */
  @Delete('roles/{roleId}')
  @Security('bearerAuth', ['ROLE:DELETE'])
  @SuccessResponse(200, 'Success')
  public async revokeRole(
    @Request() req: ExpressRequest,
    @Path() roleId: string,
    @Query() userId: string,
  ): Promise<AccessControlResponse<void>> {
    const callerId = getUserId(req)
    await unassignRole({
      userId,
      roleId,
      revokedByUserId: callerId,
    })
    return {
      success: true,
      message: 'Role revoked successfully',
    }
  }

  /**
   * Assign roles to a user.
   */
  @Post('assign-role')
  @Security('bearerAuth', ['ROLE:CREATE'])
  @SuccessResponse(200, 'Success')
  public async assignRole(
    @Request() req: ExpressRequest,
    @Body() body: AssignRoleBody,
  ): Promise<AccessControlResponse<any>> {
    const callerId = getUserId(req)
    const assignedRole = await grantRole({
      userId: body.userId,
      roleIds: body.roleIds,
      callerId,
    })
    return {
      success: true,
      message: 'Role assigned successfully',
      data: assignedRole,
    }
  }

  /**
   * Get all permission definitions.
   */
  @Get('permissions')
  @Security('bearerAuth', ['ROLE:READ'])
  @SuccessResponse(200, 'Success')
  public async getAllPermissions(): Promise<AccessControlResponse<any>> {
    const assignedRole = await fetchAllPermissions()
    return {
      success: true,
      message: 'Permissions retrieved successfully.',
      data: assignedRole,
    }
  }

  /**
   * Assign permissions to a specific role.
   */
  @Post('assign-permissions')
  @Security('bearerAuth', ['ROLE:CREATE'])
  @SuccessResponse(200, 'Success')
  public async assignPermissionsToRole(
    @Request() req: ExpressRequest,
    @Body() body: AssignPermissionsBody,
  ): Promise<AccessControlResponse<any>> {
    const callerId = getUserId(req)
    const permissionsAssigned = await assignPermissions({
      roleId: body.roleId,
      permissions: body.permissions,
      callerId,
    })
    return {
      success: true,
      message: 'Permissions assigned successfully',
      data: permissionsAssigned,
    }
  }

  /**
   * Revoke permissions from a specific role.
   */
  @Delete('revoke-permissions')
  @Security('bearerAuth', ['ROLE:DELETE'])
  @SuccessResponse(200, 'Success')
  public async revokePermissionsFromRole(
    @Request() req: ExpressRequest,
    @Body() body: AssignPermissionsBody,
  ): Promise<AccessControlResponse<void>> {
    const callerId = getUserId(req)
    await revokePermissions({
      roleId: body.roleId,
      permissions: body.permissions,
      callerId,
    })
    return {
      success: true,
      message: 'Permissions revoked successfully',
    }
  }

  /**
   * Get all registered system resources.
   */
  @Get('resources')
  @Security('bearerAuth', ['ROLE:READ'])
  @SuccessResponse(200, 'Success')
  public async getAllResources(): Promise<AccessControlResponse<any>> {
    const result = await fetchAllResources()
    return {
      success: true,
      message: 'Resources retrieved successfully.',
      data: result,
    }
  }

  /**
   * Map actions to resources.
   */
  @Post('resource-mappings')
  @Security('bearerAuth', ['ROLE:CREATE'])
  @SuccessResponse(201, 'Created')
  public async assignActionsToResources(
    @Body() body: AssignActionsBody,
  ): Promise<AccessControlResponse<any>> {
    const result = await grantActionsToResources(body.resources)
    const message =
      Object.keys(result).length === 0
        ? 'No new permissions assigned (all already exist).'
        : 'Actions successfully assigned to resources.'
    this.setStatus(201)
    return {
      success: true,
      message,
      data: result,
    }
  }
}
