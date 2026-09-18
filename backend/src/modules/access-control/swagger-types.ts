import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Body,
  Path,
  Query,
  SuccessResponse,
  Response,
} from 'tsoa'
import { ApiResponse, ApiErrorResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface Role {
  id: string
  name: string
  description?: string
  permissions: Permission[]
}

export interface Permission {
  id: string
  action: string
  resourceId: string
}

export interface Resource {
  id: string
  name: string
}

export interface User {
  id: string
  email: string
  displayName?: string
}

export interface CreateRoleRequest {
  name: string
  description: string
}

export interface AssignRoleRequest {
  userId: string
  roleIds: string[]
}

export interface RevokeRoleRequest {
  userId: string
  roleId: string
}

export interface AssignPermissionsRequest {
  roleId: string
  permissions: Array<{ resourceName: string; actions: string[] }>
}

export interface AssignResourceActionsRequest {
  resources: Array<{ name: string; actions: string[] }>
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/rbac')
@Tags('Access Control (RBAC)')
export class AccessControlSwaggerController extends Controller {
  /**
   * Get the permission matrix for the currently authenticated user, keyed by resource.
   */
  @Get('user-screens')
  @Security('bearerAuth')
  @SuccessResponse(200, "User's screen permissions returned")
  async getUserScreenPermissions(): Promise<
    ApiResponse<Record<string, unknown>>
  > {
    throw new Error('tsoa spec-only')
  }

  /**
   * List users, cursor-paginated.
   */
  @Get('users')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Users returned')
  async getAllUsers(
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<User[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * List all defined roles and their associated permissions.
   */
  @Get('roles')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Roles returned')
  async getAllRoles(): Promise<ApiResponse<Role[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Create a new role.
   */
  @Post('roles')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Role added')
  async addRole(@Body() body: CreateRoleRequest): Promise<ApiResponse<Role>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Revoke (delete) a role by id.
   */
  @Delete('roles/{roleId}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Role revoked')
  @Response<ApiErrorResponse>(404, 'Role not found')
  async revokeRole(@Path() roleId: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Assign one or more roles to a user.
   */
  @Post('assign-role')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Role assigned')
  async assignRole(@Body() body: AssignRoleRequest): Promise<ApiResponse<Role>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * List all permissions grouped by role.
   */
  @Get('permissions')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Permissions returned')
  async getAllPermissions(): Promise<ApiResponse<Permission[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Assign a set of resource/action permissions to a role.
   */
  @Post('assign-permissions')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Permissions assigned')
  async assignPermissionsToRole(
    @Body() body: AssignPermissionsRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Revoke a set of resource/action permissions from a role.
   */
  @Delete('revoke-permissions')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Permissions revoked')
  async revokePermissionsFromRole(
    @Body() body: AssignPermissionsRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * List all defined resources.
   */
  @Get('resources')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Resources returned')
  async getAllResources(): Promise<ApiResponse<Resource[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Create/assign actions to one or more resources.
   */
  @Post('resource-mappings')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Actions assigned to resources')
  async assignActionsToResources(
    @Body() body: AssignResourceActionsRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
