/**
 * Display-only mirror of the backend's RESOURCE_ACTIONS table
 * (access-control/permissions.ts): which actions each resource supports. The
 * server stays the authority and rejects anything outside it; this only lets
 * the Roles screen offer to enable a supported action that has no permission
 * row yet. Keys are lower-case resource names.
 */
export const RESOURCE_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  core_app: ['read', 'write'],
  portfolio: ['read', 'write'],
  access_control: ['read'],
  role: ['read', 'write', 'delete'],
}
