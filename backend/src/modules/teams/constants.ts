export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** TXT record a company adds to prove domain ownership: `_stockpros-verify.<domain>`. */
export const DOMAIN_VERIFICATION_RECORD_PREFIX = '_stockpros-verify'
export const DOMAIN_VERIFICATION_VALUE_PREFIX = 'stockpros-verification='

/** Public mailbox providers can never be claimed as a company domain. */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
])

export const SEARCH_RESULT_LIMIT = 20
export const TOP_SYMBOLS_LIMIT = 10

export enum PreferenceTheme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  SYSTEM = 'SYSTEM',
}

export enum ChartLayout {
  SINGLE = 'SINGLE',
  SPLIT = 'SPLIT',
  GRID = 'GRID',
}

/** Deleting a workspace touches every member and asset row; allow more than Prisma's 5 s default. */
export const TEAM_DELETE_TX_TIMEOUT_MS = 30_000
