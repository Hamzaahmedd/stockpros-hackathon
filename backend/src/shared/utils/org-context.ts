import type { AuthenticatedRequest } from '../../modules/auth/types'

/**
 * Response extras carrying the workspace's org instructions for team members
 * (set by `attachTeamContext`). Empty for everyone else, so non-team payloads
 * are unchanged. Clients/AI consumers append `orgContext` to their prompts.
 */
export const orgContextExtra = (
  req: AuthenticatedRequest,
): { orgContext?: string } => {
  const instructions = req.teamContext?.membership?.orgInstructions
  return instructions ? { orgContext: instructions } : {}
}
