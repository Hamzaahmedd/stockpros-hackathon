import 'dotenv/config'
import { Action, Resource } from '../src/modules/access-control/permissions'
import { prisma } from '../src/shared/infrastructure/database'

type ResourceDefinition = {
  name: Resource
  description: string
  actions: readonly Action[]
}

const RESOURCE_CATALOG: readonly ResourceDefinition[] = [
  {
    name: Resource.CORE_APP,
    description: 'Standard StockPros product experience and user workflows.',
    actions: [Action.READ, Action.WRITE],
  },
  {
    name: Resource.PORTFOLIO,
    description: 'Portfolio Health, portfolio uploads, analysis, and reports.',
    actions: [Action.READ, Action.WRITE],
  },
  {
    name: Resource.ACCESS_CONTROL,
    description: 'Access Control screens and navigation.',
    actions: [Action.READ],
  },
  {
    name: Resource.ROLE,
    description: 'Role assignment and permission-matrix administration APIs.',
    actions: [Action.READ, Action.WRITE, Action.DELETE],
  },
]

async function replaceRolePermissions(
  roleId: string,
  permissionIds: readonly string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } })
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    })
  })
}

async function main(): Promise<void> {
  const resources = await Promise.all(
    RESOURCE_CATALOG.map(({ name, description }) =>
      prisma.resource.upsert({
        where: { name },
        update: { description },
        create: { name, description },
      }),
    ),
  )

  const resourceIds = new Map(
    resources.map((resource) => [resource.name, resource.id]),
  )
  const permissions = await Promise.all(
    RESOURCE_CATALOG.flatMap(({ name, actions }) =>
      actions.map((action) =>
        prisma.permission.upsert({
          where: {
            action_resourceId: {
              action,
              resourceId: resourceIds.get(name)!,
            },
          },
          update: {},
          create: {
            action,
            resourceId: resourceIds.get(name)!,
          },
        }),
      ),
    ),
  )

  const permissionIds = new Map(
    permissions.map((permission) => [
      `${permission.resourceId}:${permission.action}`,
      permission.id,
    ]),
  )
  const permissionId = (resourceName: Resource, action: Action): string => {
    const resourceId = resourceIds.get(resourceName)
    const id = resourceId
      ? permissionIds.get(`${resourceId}:${action}`)
      : undefined
    if (!id)
      throw new Error(`Missing seeded permission ${resourceName}:${action}`)
    return id
  }

  const [analyst, portfolioManager, admin] = await Promise.all([
    prisma.role.upsert({
      where: { name: 'ANALYST' },
      update: { description: 'Default standard-product access bundle.' },
      create: {
        name: 'ANALYST',
        description: 'Default standard-product access bundle.',
      },
    }),
    prisma.role.upsert({
      where: { name: 'PORTFOLIO_MANAGER' },
      update: {
        description: 'Standard-product access plus portfolio workflows.',
      },
      create: {
        name: 'PORTFOLIO_MANAGER',
        description: 'Standard-product access plus portfolio workflows.',
      },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: { description: 'Access-control administration only.' },
      create: {
        name: 'ADMIN',
        description: 'Access-control administration only.',
      },
    }),
  ])

  await Promise.all([
    replaceRolePermissions(analyst.id, [
      permissionId(Resource.CORE_APP, Action.READ),
      permissionId(Resource.CORE_APP, Action.WRITE),
    ]),
    replaceRolePermissions(portfolioManager.id, [
      permissionId(Resource.CORE_APP, Action.READ),
      permissionId(Resource.CORE_APP, Action.WRITE),
      permissionId(Resource.PORTFOLIO, Action.READ),
      permissionId(Resource.PORTFOLIO, Action.WRITE),
    ]),
    replaceRolePermissions(admin.id, [
      permissionId(Resource.ACCESS_CONTROL, Action.READ),
      permissionId(Resource.ROLE, Action.READ),
      permissionId(Resource.ROLE, Action.WRITE),
      permissionId(Resource.ROLE, Action.DELETE),
    ]),
  ])

  await prisma.rbacConfiguration.upsert({
    where: { id: 'system' },
    update: {},
    create: { id: 'system', defaultRoleId: analyst.id },
  })

  process.stdout.write(
    'RBAC catalog and default role configuration are ready.\n',
  )
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
