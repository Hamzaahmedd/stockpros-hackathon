import { X509Certificate } from 'node:crypto'
import { z } from 'zod'
import { SsoConfigurationError, type SsoConnectionConfig } from './provider'

// Stored values were validated as certificates; a bare public key PEM is read back as-is.
const PEM_BLOCK =
  /-----BEGIN (CERTIFICATE|PUBLIC KEY)-----[\s\S]+?-----END \1-----/g

const connectionSchema = z.object({
  idpEntityId: z.string().trim().min(1).max(1024),
  idpSsoUrl: z
    .string()
    .trim()
    .max(2048)
    .regex(/^https:\/\//i, 'The IdP sign-in URL must use https')
    .url(),
  idpCertificate: z.string().trim().min(1).max(32_768),
})

const toPem = (body: string): string => {
  const lines = body.replaceAll(/\s+/g, '').match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
}

/** Every certificate in the value, as PEM. A bare base64 body counts as one. */
export const splitCertificates = (raw: string): string[] => {
  const blocks = raw.match(PEM_BLOCK)
  return blocks ? blocks.map((block) => block.trim()) : [toPem(raw)]
}

const parseCertificate = (pem: string): X509Certificate => {
  try {
    return new X509Certificate(pem)
  } catch {
    throw new SsoConfigurationError(
      'The IdP certificate is not a valid X.509 certificate',
    )
  }
}

const isCurrentlyValid = (certificate: X509Certificate, now: Date): boolean =>
  now >= new Date(certificate.validFrom) && now <= new Date(certificate.validTo)

/**
 * Checks an IdP's settings and returns them normalised (certificates as PEM).
 * Several certificates are accepted so an IdP can rotate its key; at least one
 * must be valid right now.
 */
export const validateConnectionConfig = (
  config: SsoConnectionConfig,
  now: Date,
): SsoConnectionConfig => {
  const parsed = connectionSchema.safeParse(config)
  if (!parsed.success) {
    throw new SsoConfigurationError(
      parsed.error.issues[0]?.message ?? 'Invalid IdP settings',
    )
  }
  const certificates = splitCertificates(parsed.data.idpCertificate)
  const usable = certificates.map(parseCertificate)
  if (!usable.some((certificate) => isCurrentlyValid(certificate, now))) {
    throw new SsoConfigurationError(
      'The IdP certificate is expired or not yet valid',
    )
  }
  return { ...parsed.data, idpCertificate: certificates.join('\n') }
}

/** The latest expiry among the stored certificates, for showing admins when to rotate. */
export const certificateExpiry = (idpCertificate: string): Date | null => {
  const expiries = splitCertificates(idpCertificate).flatMap((pem) => {
    try {
      return [new Date(new X509Certificate(pem).validTo)]
    } catch {
      return []
    }
  })
  return expiries.length
    ? new Date(Math.max(...expiries.map((date) => date.getTime())))
    : null
}
