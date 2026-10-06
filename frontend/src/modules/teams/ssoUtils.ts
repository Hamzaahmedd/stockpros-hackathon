import { DomainAuthPolicy } from '@/modules/auth/types'
import { SsoConfigSource, type SsoConfig, type SsoConfigInput } from './types'

/** The backend answers with this code while single sign-on is switched off, so the UI offers nothing. */
export const SSO_FEATURE_DISABLED_CODE = 'FORBIDDEN_FEATURE_DISABLED'

/** Query parameter a test sign-in returns to the security page with; its values are `SsoReturnResult`. */
export const SSO_TEST_PARAM = 'sso_test'

/** Mirrors the backend's cap on a metadata document. */
export const MAX_METADATA_FILE_BYTES = 256 * 1024

/** Certificates this close to expiry get a warning so the admin can rotate in time. */
export const CERT_EXPIRY_WARNING_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export enum SsoStatus {
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  NEEDS_TEST = 'NEEDS_TEST',
  READY = 'READY',
  ENABLED = 'ENABLED',
  REQUIRED = 'REQUIRED',
}

export const SSO_STATUS_LABELS: Record<SsoStatus, string> = {
  [SsoStatus.NOT_CONFIGURED]: 'Not configured',
  [SsoStatus.NEEDS_TEST]: 'Needs a test',
  [SsoStatus.READY]: 'Tested, not enabled',
  [SsoStatus.ENABLED]: 'Enabled',
  [SsoStatus.REQUIRED]: 'Required for everyone',
}

export const ssoStatus = (config: SsoConfig): SsoStatus => {
  if (config.authPolicy === DomainAuthPolicy.SAML_SSO) {
    return SsoStatus.REQUIRED
  }
  if (!config.configured) return SsoStatus.NOT_CONFIGURED
  if (config.enabled) return SsoStatus.ENABLED
  return config.testedAt ? SsoStatus.READY : SsoStatus.NEEDS_TEST
}

/** SSO can be required once it is enabled and a test sign-in has passed. */
export const isSsoReady = (config: SsoConfig): boolean =>
  config.enabled && config.testedAt !== null

export enum CertificateExpiryState {
  NONE = 'NONE',
  OK = 'OK',
  SOON = 'SOON',
  EXPIRED = 'EXPIRED',
}

export const certificateExpiryState = (
  expiresAt: string | null,
  now: Date = new Date(),
): CertificateExpiryState => {
  if (!expiresAt) return CertificateExpiryState.NONE
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  if (remaining <= 0) return CertificateExpiryState.EXPIRED
  return remaining <= CERT_EXPIRY_WARNING_DAYS * DAY_MS
    ? CertificateExpiryState.SOON
    : CertificateExpiryState.OK
}

export interface SsoProviderPreset {
  id: string
  name: string
  steps: readonly string[]
}

export const SSO_PROVIDER_PRESETS: readonly SsoProviderPreset[] = [
  {
    id: 'okta',
    name: 'Okta',
    steps: [
      'In Okta Admin, create a SAML 2.0 app integration.',
      'Paste the ACS URL as the Single sign-on URL and the Entity ID as the Audience URI (SP Entity ID).',
      'Set Name ID format to EmailAddress and Application username to Email.',
      'Copy the Metadata URL from the Sign On tab and paste it below.',
    ],
  },
  {
    id: 'azure',
    name: 'Microsoft Entra ID (Azure AD)',
    steps: [
      'Under Enterprise applications, create your own application (non-gallery) and open Single sign-on, then SAML.',
      'Paste the Entity ID as the Identifier and the ACS URL as the Reply URL.',
      'Make sure the email address claim carries the user’s email.',
      'Copy the App Federation Metadata URL and paste it below.',
    ],
  },
  {
    id: 'ping',
    name: 'Ping Identity',
    steps: [
      'Add a SAML application and paste the ACS URL and Entity ID.',
      'Map the user’s email to an attribute named email, or use an email Name ID.',
      'Download the signing certificate or metadata and upload it below.',
    ],
  },
  {
    id: 'google',
    name: 'Google Workspace',
    steps: [
      'In the Admin console, add a custom SAML app (Apps, Web and mobile apps).',
      'Download the IdP metadata and upload the XML below.',
      'In Service provider details paste the ACS URL and Entity ID, set Name ID format to EMAIL and Name ID to Primary email.',
      'Turn the app on for your users.',
    ],
  },
]

export const SSO_SOURCE_LABELS: Record<SsoConfigSource, string> = {
  [SsoConfigSource.METADATA_URL]: 'Metadata URL',
  [SsoConfigSource.METADATA_XML]: 'Upload metadata file',
  [SsoConfigSource.MANUAL]: 'Enter manually',
}

export const SSO_SOURCES: readonly SsoConfigSource[] =
  Object.values(SsoConfigSource)

export const parseSsoSource = (value: string): SsoConfigSource | undefined =>
  SSO_SOURCES.find((source) => source === value)

export interface SsoFormValues {
  source: SsoConfigSource
  metadataUrl: string
  metadataXml: string
  idpEntityId: string
  idpSsoUrl: string
  idpCertificate: string
}

export const EMPTY_SSO_FORM: SsoFormValues = {
  source: SsoConfigSource.METADATA_URL,
  metadataUrl: '',
  metadataXml: '',
  idpEntityId: '',
  idpSsoUrl: '',
  idpCertificate: '',
}

const isHttps = (value: string): boolean => {
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

/** The request for the form as filled in, or null while it is incomplete or not https. The server validates again. */
export const buildSsoInput = (form: SsoFormValues): SsoConfigInput | null => {
  switch (form.source) {
    case SsoConfigSource.METADATA_URL:
      return isHttps(form.metadataUrl)
        ? {
            source: SsoConfigSource.METADATA_URL,
            metadataUrl: form.metadataUrl.trim(),
          }
        : null
    case SsoConfigSource.METADATA_XML:
      return form.metadataXml.trim()
        ? {
            source: SsoConfigSource.METADATA_XML,
            metadataXml: form.metadataXml,
          }
        : null
    case SsoConfigSource.MANUAL:
      return form.idpEntityId.trim() &&
        isHttps(form.idpSsoUrl) &&
        form.idpCertificate.trim()
        ? {
            source: SsoConfigSource.MANUAL,
            idpEntityId: form.idpEntityId.trim(),
            idpSsoUrl: form.idpSsoUrl.trim(),
            idpCertificate: form.idpCertificate.trim(),
          }
        : null
  }
}

/** Reads an uploaded metadata file; refuses anything over the backend's size cap before it is sent. */
export const readMetadataFile = async (file: File): Promise<string> => {
  if (file.size > MAX_METADATA_FILE_BYTES) {
    throw new Error('That file is too large to be SAML metadata (max 256 KB)')
  }
  return file.text()
}

/** The IdP URL the browser is sent to for a test sign-in; only https is followed. */
export const isSafeIdpUrl = isHttps
