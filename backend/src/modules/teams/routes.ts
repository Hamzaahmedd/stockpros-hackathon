import express from 'express'
import { authTokenMiddleware } from '../auth'
import * as TeamsController from './controller'

const router = express.Router()

router.use(authTokenMiddleware)

// ─── Workspace, seats & billing entry points ─────────────────────────────────
router.post('/', TeamsController.createTeam)
router.get('/me', TeamsController.getMyTeam)
router.post('/seats/add', TeamsController.addSeats)
router.post('/seats/reduce', TeamsController.scheduleSeatReduction)
router.delete('/seats/reduce', TeamsController.cancelSeatReduction)
router.patch('/', TeamsController.renameTeam)
router.delete('/', TeamsController.deleteTeam)
router.get('/export', TeamsController.exportTeam)
router.get('/audit-log', TeamsController.listAuditLog)
router.patch('/billing-contact', TeamsController.updateBillingContact)
router.post('/ownership/transfer', TeamsController.transferOwnership)
router.post('/leave', TeamsController.leaveTeam)

// ─── Members & invites ───────────────────────────────────────────────────────
router.get('/members', TeamsController.listMembers)
router.post('/invites', TeamsController.createInvite)
router.post('/invites/accept', TeamsController.acceptInvite)
router.get('/invites', TeamsController.listInvites)
router.delete('/invites/:id', TeamsController.revokeInvite)
router.post('/invites/:id/resend', TeamsController.resendInvite)
router.patch('/members/:userId/role', TeamsController.changeMemberRole)
router.delete('/members/:userId', TeamsController.removeMember)
router.patch(
  '/members/:userId/credit-limit',
  TeamsController.setMemberCreditLimit,
)

// ─── Domains, instructions & preferences ─────────────────────────────────────
router.post('/domains', TeamsController.addDomain)
router.post('/domains/verify', TeamsController.verifyDomain)
router.patch('/instructions', TeamsController.updateInstructions)
router.get('/preferences', TeamsController.getPreferences)
router.patch('/preferences', TeamsController.updateMyPreferences)
router.patch(
  '/preferences/workspace',
  TeamsController.updateWorkspacePreferences,
)

// ─── Analytics & search ──────────────────────────────────────────────────────
router.get('/analytics', TeamsController.getAnalytics)
router.get('/search', TeamsController.search)

// ─── Shared assets ───────────────────────────────────────────────────────────
router.get('/watchlists', TeamsController.listWatchlists)
router.post('/watchlists', TeamsController.createWatchlist)
router.delete('/watchlists/:id', TeamsController.deleteWatchlist)
router.get('/screeners', TeamsController.listScreeners)
router.post('/screeners', TeamsController.createScreener)
router.delete('/screeners/:id', TeamsController.deleteScreener)
router.get('/notes', TeamsController.listNotes)
router.post('/notes', TeamsController.createNote)
router.delete('/notes/:id', TeamsController.deleteNote)

export default router
