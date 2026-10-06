export type PlanTier = 'FREE' | 'PRO' | 'TEAM'

/** Internal staff access level; `USER` for regular customers. Mirrors the backend `PlatformRole` enum. */
export type PlatformRole =
  'USER' | 'SUPPORT_AGENT' | 'PLATFORM_ADMIN' | 'SUPER_ADMIN'

export type User = {
  id?: string
  userId: string
  email: string
  displayName?: string
  roles?: any[]
  userRoles?: any[]
  phoneVerifiedAt?: string | null
  plan?: PlanTier
  platformRole?: PlatformRole
} | null

export type ScreenPermissions = {
  canRead?: boolean
  canWrite?: boolean
  canEdit?: boolean
  canDelete?: boolean
}

/** How a verified company domain lets its users sign in. Mirrors the backend `DomainAuthPolicy` enum. */
export enum DomainAuthPolicy {
  ANY = 'ANY',
  GOOGLE_ONLY = 'GOOGLE_ONLY',
  GOOGLE_WORKSPACE = 'GOOGLE_WORKSPACE',
}

export type RequestMagicLinkDto = {
  email: string
}

export type OnboardingDto = {
  displayName: string
}

export type AuthContextValue = {
  user: User
  screenPermissions: Record<string, ScreenPermissions>
  loading: boolean
  pricingTiersEnabled: boolean
  enablePaymentProcessor: boolean
  sendMagicLink: (email: string) => Promise<boolean>
  login: (email: string) => Promise<boolean>
  register: (payload: { email: string }) => Promise<void>
  logout: () => Promise<void>
  can: (resource: string, action: keyof ScreenPermissions) => boolean
  refreshMe: () => Promise<User>
}

export type {
  LoginFormValues,
  OnboardingFormValues,
  RequestPhoneOtpFormValues,
  VerifyPhoneOtpFormValues,
} from './validation'

export interface SuggestedSymbol {
  symbol: string
  name: string
  sector: string
  category: 'all' | 'tech' | 'growth' | 'consumer' | 'index'
  hasAiForecast: boolean
}

export type NotificationPreferenceToggle =
  'inAppAlertsEnabled' | 'emailVolatilityAlertsEnabled' | 'dailyDigestEnabled'
