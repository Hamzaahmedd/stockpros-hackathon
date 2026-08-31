import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Security,
  Body,
  Path,
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

export interface Screen {
  id: string
  resourceId: string
  roleId: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canArchive: boolean
  canManage: boolean
}

export interface CreateRoleRequest {
  name: string
  description?: string
}

export interface UpdatePermissionsRequest {
  permissions: Array<{
    screen: string
    canCreate?: boolean
    canRead?: boolean
    canUpdate?: boolean
    canDelete?: boolean
  }>
}

export interface AssignRoleRequest {
  userId: string
  roleId: string
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/access-control')
@Tags('Access Control (RBAC)')
export class AccessControlSwaggerController extends Controller {
  /**
   * List all defined roles and their associated permissions.
   */
  @Get('roles')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Roles returned')
  async getRoles(): Promise<ApiResponse<Role[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Create a new role.
   */
  @Post('roles')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Role created')
  @Response<ApiErrorResponse>(409, 'Role name already exists')
  async createRole(
    @Body() body: CreateRoleRequest,
  ): Promise<ApiResponse<Role>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Update screen-level CRUD permissions for a role.
   */
  @Put('roles/{id}/permissions')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Permissions updated')
  @Response<ApiErrorResponse>(404, 'Role not found')
  async updatePermissions(
    @Path() id: string,
    @Body() body: UpdatePermissionsRequest,
  ): Promise<ApiResponse<Role>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete a role and revoke it from all assigned users.
   */
  @Delete('roles/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Role deleted')
  @Response<ApiErrorResponse>(404, 'Role not found')
  async deleteRole(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Assign a role to a user.
   */
  @Post('assign')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Role assigned')
  async assignRole(@Body() body: AssignRoleRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Revoke a role from a user.
   */
  @Post('revoke')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Role revoked')
  async revokeRole(@Body() body: AssignRoleRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get the permission matrix for the currently authenticated user.
   */
  @Get('my-permissions')
  @Security('bearerAuth')
  @SuccessResponse(200, "User's permissions returned")
  async getMyPermissions(): Promise<ApiResponse<Permission[]>> {
    throw new Error('tsoa spec-only')
  }
}
