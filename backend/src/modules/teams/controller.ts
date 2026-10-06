import { NextFunction, Response } from 'express'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AuthenticatedRequest } from '../auth'
import * as Admin from './admin-service'
import * as AuthPolicy from './auth-policy'
import * as JoinRequests from './join-requests'
import * as TeamService from './service'
import * as Workspace from './workspace-service'
import {
  acceptInviteValidator,
  addDomainValidator,
  addSeatsValidator,
  auditLogQueryValidator,
  authPolicyValidator,
  billingContactValidator,
  changeRoleValidator,
  createInviteValidator,
  createTeamValidator,
  creditLimitValidator,
  deleteTeamValidator,
  idParamValidator,
  notesQueryValidator,
  instructionsValidator,
  joinPolicyParamValidator,
  joinPolicyValidator,
  joinRequestValidator,
  preferencesValidator,
  reduceSeatsValidator,
  renameTeamValidator,
  researchNoteValidator,
  searchQueryValidator,
  sharedScreenerValidator,
  sharedWatchlistValidator,
  transferOwnershipValidator,
  userIdParamValidator,
  verifyDomainValidator,
} from './validation'

interface HandlerOutput {
  data?: unknown
  extra?: object
}

/** Wraps a service call in the standard envelope + error forwarding. */
const handle =
  (
    message: string,
    run: (
      req: AuthenticatedRequest,
      userId: string,
    ) => Promise<HandlerOutput | void>,
    statusCode = 200,
  ) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const output = (await run(req, getUserId(req))) ?? {}
      return sendSuccess(res, { message, statusCode, ...output })
    } catch (error) {
      next(error)
    }
  }

/** Paid flows answer with a checkout to redirect to; bypass flows with the result. */
const paidOutput = <T>(
  outcome: TeamService.PaidActionResult<T>,
): HandlerOutput =>
  outcome.checkout ? { extra: outcome.checkout } : { data: outcome.result }

export const createTeam = handle(
  'Team request processed',
  async (req, userId) =>
    paidOutput(
      await TeamService.createTeam(
        userId,
        validateOrThrow(createTeamValidator, req.body),
      ),
    ),
  201,
)

export const addSeats = handle('Seat request processed', async (req, userId) =>
  paidOutput(
    await TeamService.addSeats(
      userId,
      validateOrThrow(addSeatsValidator, req.body).seatCount,
    ),
  ),
)

export const getMyTeam = handle('Team fetched', async (_req, userId) => ({
  data: await TeamService.getMyTeam(userId),
}))

export const listMembers = handle('Members fetched', async (_req, userId) => ({
  data: await TeamService.listMembers(userId),
}))

export const createInvite = handle(
  'Invite created',
  async (req, userId) => ({
    data: await TeamService.createInvite(
      userId,
      validateOrThrow(createInviteValidator, req.body),
    ),
  }),
  201,
)

export const acceptInvite = handle('Invite accepted', async (req, userId) => ({
  data: await TeamService.acceptInvite(
    userId,
    validateOrThrow(acceptInviteValidator, req.body).token,
  ),
}))

export const removeMember = handle('Member removed', async (req, userId) => {
  const { userId: targetUserId } = validateOrThrow(
    userIdParamValidator,
    req.params,
  )
  await TeamService.removeMember(userId, targetUserId)
})

export const addDomain = handle(
  'Domain added',
  async (req, userId) => ({
    data: await TeamService.addDomain(
      userId,
      validateOrThrow(addDomainValidator, req.body),
    ),
  }),
  201,
)

export const verifyDomain = handle('Domain checked', async (req, userId) => ({
  data: await TeamService.verifyDomain(
    userId,
    validateOrThrow(verifyDomainValidator, req.body).domain,
  ),
}))

export const listJoinOptions = handle('Join options', async (_req, userId) => ({
  data: await JoinRequests.listJoinOptions(userId),
}))

export const getMyJoinRequest = handle(
  'Your join request',
  async (_req, userId) => ({
    data: await JoinRequests.getMyJoinRequest(userId),
  }),
)

export const requestToJoin = handle(
  'Join request processed',
  async (req, userId) => ({
    data: await JoinRequests.requestToJoin(
      userId,
      validateOrThrow(joinRequestValidator, req.body).teamId,
    ),
  }),
  201,
)

export const cancelMyJoinRequest = handle(
  'Join request cancelled',
  async (_req, userId) => {
    await JoinRequests.cancelMyJoinRequest(userId)
  },
)

export const listJoinRequests = handle(
  'Join requests',
  async (_req, userId) => ({
    data: await JoinRequests.listJoinRequests(userId),
  }),
)

export const approveJoinRequest = handle(
  'Join request approved',
  async (req, userId) => {
    const { id } = validateOrThrow(idParamValidator, req.params)
    await JoinRequests.approveJoinRequest(userId, id)
  },
)

export const declineJoinRequest = handle(
  'Join request declined',
  async (req, userId) => {
    const { id } = validateOrThrow(idParamValidator, req.params)
    await JoinRequests.declineJoinRequest(userId, id)
  },
)

export const setJoinPolicy = handle(
  'Join policy updated',
  async (req, userId) => ({
    data: await JoinRequests.setJoinPolicy(
      userId,
      validateOrThrow(joinPolicyParamValidator, req.params).domain,
      validateOrThrow(joinPolicyValidator, req.body).joinPolicy,
    ),
  }),
)

export const setAuthPolicy = handle(
  'Auth policy updated',
  async (req, userId) => ({
    data: await AuthPolicy.setAuthPolicy(
      userId,
      req.user?.sessionId,
      validateOrThrow(joinPolicyParamValidator, req.params).domain,
      validateOrThrow(authPolicyValidator, req.body),
    ),
  }),
)

export const updateInstructions = handle(
  'Instructions updated',
  async (req, userId) => ({
    data: await TeamService.updateInstructions(
      userId,
      validateOrThrow(instructionsValidator, req.body).orgInstructions,
    ),
  }),
)

export const setMemberCreditLimit = handle(
  'Credit limit updated',
  async (req, userId) => {
    const { userId: targetUserId } = validateOrThrow(
      userIdParamValidator,
      req.params,
    )
    const { monthlyCreditLimitPaisa } = validateOrThrow(
      creditLimitValidator,
      req.body,
    )
    return {
      data: await TeamService.setMemberCreditLimit(
        userId,
        targetUserId,
        monthlyCreditLimitPaisa,
      ),
    }
  },
)

export const getPreferences = handle(
  'Preferences fetched',
  async (_r, userId) => ({
    data: await TeamService.getPreferences(userId),
  }),
)

export const updateMyPreferences = handle(
  'Preferences updated',
  async (req, userId) => ({
    data: await TeamService.updateMyPreferences(
      userId,
      validateOrThrow(preferencesValidator, req.body),
    ),
  }),
)

export const updateWorkspacePreferences = handle(
  'Workspace preferences updated',
  async (req, userId) => ({
    data: await TeamService.updateWorkspacePreferences(
      userId,
      validateOrThrow(preferencesValidator, req.body),
    ),
  }),
)

export const getAnalytics = handle('Analytics fetched', async (_r, userId) => ({
  data: await Workspace.getTeamAnalytics(userId),
}))

export const search = handle(
  'Workspace search completed',
  async (req, userId) => ({
    data: await Workspace.searchWorkspace(
      userId,
      validateOrThrow(searchQueryValidator, req.query).q,
    ),
  }),
)

// ─── Shared assets ────────────────────────────────────────────────────────────

const idParam = (req: AuthenticatedRequest) =>
  validateOrThrow(idParamValidator, req.params).id

export const listWatchlists = handle(
  'Shared watchlists fetched',
  async (_r, userId) => ({
    data: await Workspace.listSharedWatchlists(userId),
  }),
)
export const createWatchlist = handle(
  'Shared watchlist created',
  async (req, userId) => ({
    data: await Workspace.createSharedWatchlist(
      userId,
      validateOrThrow(sharedWatchlistValidator, req.body),
    ),
  }),
  201,
)
export const deleteWatchlist = handle(
  'Shared watchlist deleted',
  async (req, userId) => {
    await Workspace.deleteSharedWatchlist(userId, idParam(req))
  },
)

export const listScreeners = handle(
  'Shared screeners fetched',
  async (_r, userId) => ({
    data: await Workspace.listSharedScreeners(userId),
  }),
)
export const createScreener = handle(
  'Shared screener created',
  async (req, userId) => ({
    data: await Workspace.createSharedScreener(
      userId,
      validateOrThrow(sharedScreenerValidator, req.body),
    ),
  }),
  201,
)
export const deleteScreener = handle(
  'Shared screener deleted',
  async (req, userId) => {
    await Workspace.deleteSharedScreener(userId, idParam(req))
  },
)

export const listNotes = handle(
  'Research notes fetched',
  async (req, userId) => ({
    data: await Workspace.listResearchNotes(
      userId,
      validateOrThrow(notesQueryValidator, req.query).symbol,
    ),
  }),
)
export const createNote = handle(
  'Research note created',
  async (req, userId) => ({
    data: await Workspace.createResearchNote(
      userId,
      validateOrThrow(researchNoteValidator, req.body),
    ),
  }),
  201,
)
export const deleteNote = handle(
  'Research note deleted',
  async (req, userId) => {
    await Workspace.deleteResearchNote(userId, idParam(req))
  },
)

// ─── Roles, ownership & membership ────────────────────────────────────────────

export const changeMemberRole = handle('Role updated', async (req, userId) => {
  const { userId: targetUserId } = validateOrThrow(
    userIdParamValidator,
    req.params,
  )
  const { role } = validateOrThrow(changeRoleValidator, req.body)
  return { data: await Admin.changeMemberRole(userId, targetUserId, role) }
})

export const transferOwnership = handle(
  'Ownership transferred',
  async (req, userId) => {
    await Admin.transferOwnership(
      userId,
      validateOrThrow(transferOwnershipValidator, req.body).userId,
    )
  },
)

export const leaveTeam = handle(
  'You left the workspace',
  async (_r, userId) => {
    await Admin.leaveTeam(userId)
  },
)

export const listInvites = handle('Invites fetched', async (_r, userId) => ({
  data: await Admin.listInvites(userId),
}))

export const revokeInvite = handle('Invite revoked', async (req, userId) => {
  await Admin.revokeInvite(userId, idParam(req))
})

export const resendInvite = handle('Invite resent', async (req, userId) => ({
  data: await Admin.resendInvite(userId, idParam(req)),
}))

// ─── Workspace lifecycle ──────────────────────────────────────────────────────

export const renameTeam = handle('Workspace renamed', async (req, userId) => ({
  data: await Admin.renameTeam(
    userId,
    validateOrThrow(renameTeamValidator, req.body).name,
  ),
}))

export const deleteTeam = handle('Workspace deleted', async (req, userId) => {
  await Admin.deleteTeam(
    userId,
    validateOrThrow(deleteTeamValidator, req.body).confirmName,
  )
})

/** A download, not an envelope: the file the owner saves. */
export const exportTeam = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const snapshot = await Admin.exportTeam(getUserId(req))
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="workspace-export.json"',
    )
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(snapshot)
  } catch (error) {
    next(error)
  }
}

// ─── Billing contact & seat reduction ─────────────────────────────────────────

export const updateBillingContact = handle(
  'Billing contact updated',
  async (req, userId) => ({
    data: await Admin.updateBillingContact(
      userId,
      validateOrThrow(billingContactValidator, req.body).billingEmail,
    ),
  }),
)

export const scheduleSeatReduction = handle(
  'Seat reduction scheduled',
  async (req, userId) => ({
    data: await Admin.scheduleSeatReduction(
      userId,
      validateOrThrow(reduceSeatsValidator, req.body).seatCount,
    ),
  }),
)

export const cancelSeatReduction = handle(
  'Seat reduction cancelled',
  async (_r, userId) => ({ data: await Admin.cancelSeatReduction(userId) }),
)

// ─── Audit log ────────────────────────────────────────────────────────────────

export const listAuditLog = handle(
  'Audit log fetched',
  async (req, userId) => ({
    data: await Admin.listAuditLog(
      userId,
      validateOrThrow(auditLogQueryValidator, req.query),
    ),
  }),
)
