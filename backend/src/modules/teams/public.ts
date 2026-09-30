// Public cross-module surface for the teams module. Other modules must import
// from here, never from './service' or siblings directly (enforced by
// scripts/check-module-boundaries.cjs).
export { runTeamInviteCleanupJob } from './invite-cleanup-job'
