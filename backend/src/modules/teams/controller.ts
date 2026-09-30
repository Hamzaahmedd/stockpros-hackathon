import { NextFunction, Response } from 'express'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AuthenticatedRequest } from '../auth'
import * as TeamService from './service'
import * as Workspace from './workspace-service'
import {
  acceptInviteValidator,
  addDomainValidator,
  addSeatsValidator,
  createInviteValidator,
  createTeamValidator,
  creditLimitValidator,
  idParamValidator,
  notesQueryValidator,
  instructionsValidator,
  preferencesValidator,
  researchNoteValidator,
  searchQueryValidator,
  sharedScreenerValidator,
  sharedWatchlistValidator,
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
