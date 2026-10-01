import 'dotenv/config'
import { AdminAuditAction, PlatformRole } from '@prisma/client'
import { AdminTargetType } from '../src/modules/access-control/admin-audit'
import { prisma } from '../src/shared/infrastructure/database'

/**
 * Usage: npm run admin:grant -- <email> <USER|SUPPORT_AGENT|PLATFORM_ADMIN|SUPER_ADMIN>
 *
 * The only way to create staff: the admin API has no self-promotion path.
 * Passing USER revokes staff access. The change is recorded in admin_audit_logs
 * (the target user is its own actor, since no admin exists yet at bootstrap).
 */
async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2)
  const role = Object.values(PlatformRole).find((value) => value === roleArg)

  if (!email || !role) {
    throw new Error(
      `Usage: admin:grant <email> <${Object.values(PlatformRole).join('|')}>`,
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, platformRole: true },
  })
  if (!user) throw new Error('No user found with that email')

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { platformRole: role },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: user.id,
        action: AdminAuditAction.PLATFORM_ROLE_GRANTED,
        targetType: AdminTargetType.USER,
        targetId: user.id,
        reason: 'Granted via admin:grant CLI',
        metadata: { fromRole: user.platformRole, toRole: role },
      },
    }),
  ])

  process.stdout.write(`Platform role set to ${role} (user ${user.id}).\n`)
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
