import { Prisma } from '@prisma/client'
import { resolveFallbackPlan } from '../../shared/infrastructure/team-access'

/**
 * Hard-deletes a membership so the user's one-workspace slot (and the seat)
 * frees instantly, then drops them back to their personal plan.
 */
export async function detachMemberTx(
  tx: Prisma.TransactionClient,
  member: { id: string; userId: string },
): Promise<void> {
  await tx.teamMember.delete({ where: { id: member.id } })
  await tx.user.update({
    where: { id: member.userId },
    data: { plan: await resolveFallbackPlan(member.userId, tx) },
  })
}
