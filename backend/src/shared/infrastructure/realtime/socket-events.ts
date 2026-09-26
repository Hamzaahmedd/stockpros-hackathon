// Custom application-level Socket.IO event names (not Socket.IO's own
// reserved events like 'connection'/'disconnect'/'disconnecting').
// Mirrored on the frontend in shared/utils/socket-events.ts — kept in sync
// by hand since these are separate npm packages with no shared type boundary.
export const SocketEvent = {
  Join: 'join',
  Subscribe: 'subscribe',
  Unsubscribe: 'unsubscribe',
  Trade: 'trade',
  Subscribed: 'subscribed',
  Unsubscribed: 'unsubscribed',
  Error: 'error',
  Notification: 'notification',
  PlanRestricted: 'plan_restricted',
} as const
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent]
