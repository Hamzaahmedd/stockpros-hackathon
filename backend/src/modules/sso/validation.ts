import { z } from 'zod'

export const MAX_SAML_RESPONSE_CHARS = 512 * 1024

export const ssoStartValidator = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email({ message: 'Invalid email format' }),
})

export const ssoTenantParamValidator = z.object({
  tenantId: z.string().uuid('Invalid SSO tenant'),
})

/** The IdP's form post to the ACS URL. */
export const ssoAcsBodyValidator = z.object({
  SAMLResponse: z.string().min(1).max(MAX_SAML_RESPONSE_CHARS),
  RelayState: z.string().min(1).max(512).optional(),
})

export const ssoExchangeValidator = z.object({
  code: z.string().min(1).max(256),
  bindingToken: z.string().min(1).max(256),
})
