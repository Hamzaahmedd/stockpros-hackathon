import { Resource, Action } from './permissions'
import z from 'zod'

const ALL_CAPS_SNAKE_CASE_REGEX = /^[A-Z0-9_]+$/

export const getUsersQueryValidator = z.object({
  cursor: z.string().uuid('Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const createRoleValidator = z.object({
  name: z
    .string()
    .min(2, { message: 'Role name is required and cannot be empty.' })
    .regex(ALL_CAPS_SNAKE_CASE_REGEX, {
      message:
        "Role name must be in all caps snake case (e.g., 'SALES_MANAGER' or 'HR_ADMIN_V2').",
    }),
  description: z
    .string()
    .min(5, {
      message:
        'Role description is required and must be at least 5 characters long.',
    }),
})

export const assignPermissionsValidator = z.object({
  roleId: z.string().uuid(),
  permissions: z
    .array(
      z.object({
        resourceName: z.nativeEnum(Resource),
        actions: z.array(z.nativeEnum(Action)),
      }),
    )
    .nonempty(),
})

export const assignRoleValidator = z.object({
  roleIds: z
    .array(z.string().uuid())
    .min(1, { message: 'At least one role ID must be provided.' }),
  userId: z.string().uuid(),
})

export const revokeRoleValidator = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
})

export const assignActionsValidator = z.object({
  resources: z
    .array(
      z.object({
        name: z.string().min(1, 'Resource name is required'),
        actions: z
          .array(
            z.nativeEnum(Action, {
              required_error: 'At least one action is required',
            }),
          )
          .nonempty('At least one action must be provided'),
      }),
    )
    .nonempty('At least one resource must be provided'),
})
