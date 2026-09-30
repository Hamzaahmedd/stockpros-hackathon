import { PlanTier } from '@prisma/client'

/** PRO and TEAM both unlock the paid feature set; only quotas and billing differ. */
export const hasPaidPlan = (plan: PlanTier | undefined): boolean =>
  plan === PlanTier.PRO || plan === PlanTier.TEAM
