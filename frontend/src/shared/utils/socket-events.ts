// Custom application-level Socket.IO event names used by socketManager.ts
// (not Socket.IO's own reserved events like "connect"/"disconnect").
// Mirrored on the backend in shared/infrastructure/realtime/socket-events.ts
// — kept in sync by hand since these are separate npm packages with no
// shared type boundary.
export const SocketEvent = {
  Join: "join",
  Subscribe: "subscribe",
  Unsubscribe: "unsubscribe",
  Trade: "trade",
  Subscribed: "subscribed",
  Unsubscribed: "unsubscribed",
  Error: "error",
  FinnhubError: "finnhub_error",
  Notification: "notification",
  PlanRestricted: "plan_restricted",
} as const;
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];
