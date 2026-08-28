import config from '@/config'
import axios from 'axios'
import fs from 'fs'
import nodemailer from 'nodemailer'
import path from 'path'
import { Resend } from 'resend'
import { logger } from '../logger'

const SMTP_USER = config.smtp.user
const SMTP_PASS = config.smtp.pass
const RESEND_API_KEY = config.email.resendApiKey
const RESEND_FROM = config.email.resendFrom
const isDev = config.server.nodeEnv !== 'production'

const useSmtp = config.email.useSmtp
const useResend = config.email.useResend

const logoPublicUrl = config.email.logoUrl

const localLogoPath = path.resolve(
  __dirname,
  '../../../modules/notifications/email-templates/stockpros-logo.png',
)

const readLocalLogo = (): string | undefined => {
  try {
    return fs.readFileSync(localLogoPath).toString('base64')
  } catch {
    // Logo is optional; ignore read errors
    return undefined
  }
}

// Cache the logo so the remote URL is hit at most once per process.
let logoResolved = false
let cachedLogo: string | undefined
let inflightLogo: Promise<string | undefined> | null = null

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const getLogoBase64 = (): Promise<string | undefined> => {
  if (logoResolved) return Promise.resolve(cachedLogo)
  if (inflightLogo) return inflightLogo

  inflightLogo = (async () => {
    if (logoPublicUrl) {
      try {
        const { data } = await axios.get<ArrayBuffer>(logoPublicUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        })
        const base64 = Buffer.from(data).toString('base64')
        if (base64) {
          cachedLogo = base64
          logoResolved = true
          return cachedLogo
        }
      } catch (err: unknown) {
        logger.warn(
          `[Email] Logo fetch failed, falling back to local file: ${errorMessage(err)}`,
        )
      }
    }
    cachedLogo = readLocalLogo()
    logoResolved = true
    return cachedLogo
  })()

  return inflightLogo
}

// Initialise Resend only when enabled for this environment and an API key is provided.
const resend =
  useResend && RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

// Gmail SMTP transporter – created only when SMTP is enabled and credentials are present.
const smtpTransporter =
  useSmtp && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null

export const transporter = {
  sendMail: async (opts: {
    from?: string
    to: string
    subject: string
    text?: string
    html?: string
  }) => {
    // Resolve the brand logo (remote URL → local fallback) once per send.
    const logoBase64 = await getLogoBase64()

    // SMTP delivery (enabled per environment)
    if (smtpTransporter) {
      try {
        const info = await smtpTransporter.sendMail({
          from: opts.from || `"StockPros" <${SMTP_USER}>`,
          to: opts.to,
          subject: opts.subject,
          text: opts.text || '',
          html: opts.html || opts.text || '',
          attachments: logoBase64
            ? [
                {
                  filename: 'logo.png',
                  content: Buffer.from(logoBase64, 'base64'),
                  cid: 'logo',
                },
              ]
            : undefined,
        })
        logger.info(`[Email] Live email sent to ${opts.to} via Gmail SMTP (ID: ${info.messageId})`)
        return
      } catch (err: unknown) {
        logger.warn(`[Email] Gmail SMTP delivery failed: ${errorMessage(err)}`)
        if (!resend && !isDev) {
          throw new Error('Email delivery failed: SMTP failed and no fallback transport is enabled')
        }
      }
    }

    // Resend delivery (enabled per environment)
    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: opts.from || RESEND_FROM,
          to: opts.to,
          subject: opts.subject,
          text: opts.text || '',
          html: opts.html || opts.text || '',
        })
        if (!error) {
          logger.info(`[Email] Live email sent to ${opts.to} via Resend (ID: ${data?.id})`)
          return
        }
        logger.warn(`[Resend] Delivery notice for ${opts.to}: ${error.message}`)
      } catch (err: unknown) {
        logger.warn(`[Resend] Error sending email: ${errorMessage(err)}`)
      }
    }

    // Fallback: dev console output or production error
    if (isDev) {
      logger.info(`[Email][DEV] To: ${opts.to} | Subject: ${opts.subject}`)
      if (opts.text) logger.info(`[Email][DEV] Text: ${opts.text}`)
      return
    }
    throw new Error('Email delivery failed: no transport succeeded')
  },
}
