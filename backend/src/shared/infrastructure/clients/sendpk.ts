import config from '@/config'
import axios from 'axios'
import { logger } from '../logger'

const sendpkClient = axios.create({
  baseURL: config.sendpk.baseUrl,
  timeout: 10000, // 10 seconds
})

export interface SendWhatsappOtpParams {
  /** Canonical E.164 number, e.g. +923001234567 */
  phoneNumber: string
  code: string
}

/**
 * Sends a WhatsApp OTP via the SendPK API.
 *
 * The phone number is stored/passed internally in canonical E.164 form
 * (`+923001234567`). The leading `+` is stripped only here, immediately
 * before building the HTTP payload, since SendPK's API expects the
 * recipient number without it (`923001234567`) — this stripping happens
 * only at this dispatch boundary, never in the stored/normalized value
 * used elsewhere in the app.
 *
 * When `config.sendpk.mockProvider` is true, sends are mocked and the OTP is
 * logged at `debug` level only (never live-sent) — this is an explicit,
 * visible setting (MOCK_WHATSAPP_PROVIDER) rather than something inferred
 * from a missing API key, so mock behavior is never accidental in an
 * environment that happens to have a key configured for other reasons.
 */
export async function sendWhatsappOtp({
  phoneNumber,
  code,
}: SendWhatsappOtpParams): Promise<void> {
  if (config.sendpk.mockProvider) {
    // Local dev/test convenience only — deliberately NOT routed through the
    // structured logger, which can ship to Axiom if AXIOM_TOKEN is set even
    // in a non-production environment. The raw OTP must never reach
    // persistent/remote logs (see the equivalent magic-link dev fallback in
    // auth/service.ts).
    console.log(
      `[SendPK:mock] Would send WhatsApp OTP ${code} to ${phoneNumber}`,
    )
    return
  }

  if (!config.sendpk.apiKey || !config.sendpk.templateId) {
    throw new Error(
      'SendPK is not configured (missing SENDPK_API_KEY or SENDPK_TEMPLATE_ID)',
    )
  }

  const recipient = phoneNumber.replace(/^\+/, '')

  try {
    await sendpkClient.post('', {
      apikey: config.sendpk.apiKey,
      template_id: config.sendpk.templateId,
      phone: recipient,
      variables: { otp: code },
    })
  } catch (err) {
    logger.error('[SendPK] Failed to send WhatsApp OTP', err)
    throw new Error('Failed to send WhatsApp OTP')
  }
}

export default sendWhatsappOtp
