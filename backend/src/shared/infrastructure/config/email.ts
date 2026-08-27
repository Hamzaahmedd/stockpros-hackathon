import axios from 'axios';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { Resend } from 'resend';
import config from './env';

const SMTP_USER = config.smtp.user;
const SMTP_PASS = config.smtp.pass;
const RESEND_API_KEY = config.email.resendApiKey;
const RESEND_FROM = config.email.resendFrom;
const isDev = config.server.nodeEnv !== 'production';

const logoPublicUrl = config.email.logoUrl;

const localLogoPath = path.resolve(__dirname, '../../../modules/notifications/email-templates/stockpros-logo.png');

const readLocalLogo = (): string | undefined => {
  try {
    return fs.readFileSync(localLogoPath).toString('base64');
  } catch (_) {
    // Logo is optional; ignore errors
    return undefined;
  }
};

// Cache the logo so Supabase Storage is hit at most once per process.
let logoResolved = false;
let cachedLogo: string | undefined;
let inflightLogo: Promise<string | undefined> | null = null;

const getLogoBase64 = (): Promise<string | undefined> => {
  if (logoResolved) return Promise.resolve(cachedLogo);
  if (inflightLogo) return inflightLogo;

  inflightLogo = (async () => {
    if (logoPublicUrl) {
      try {
        const { data } = await axios.get<ArrayBuffer>(logoPublicUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        const base64 = Buffer.from(data).toString('base64');
        if (base64) {
          cachedLogo = base64;
          logoResolved = true;
          return cachedLogo;
        }
      } catch (err: any) {
        console.warn('[Email] Supabase logo fetch failed, falling back to local file:', err.message);
      }
    }
    cachedLogo = readLocalLogo();
    logoResolved = true;
    return cachedLogo;
  })();

  return inflightLogo;
};

// Initialise Resend if API key provided
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Gmail SMTP transporter – created only when credentials are present
const smtpTransporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

export const transporter = {
  sendMail: async (opts: { from?: string; to: string; subject: string; text?: string; html?: string }) => {
    // Resolve the brand logo (Supabase Storage → local fallback) once per send.
    const logoBase64 = await getLogoBase64();
    // 1. Primary delivery via Gmail SMTP (if configured)
    if (smtpTransporter) {
      try {
        const info = await smtpTransporter.sendMail({
          from: opts.from || `"StockPros" <${SMTP_USER}>`,
          to: opts.to,
          subject: opts.subject,
          text: opts.text || '',
          html: opts.html || opts.text || '',
          attachments: logoBase64 ? [{ filename: 'logo.png', content: Buffer.from(logoBase64, 'base64'), cid: 'logo' }] : undefined,
        });
        console.log(`[Email] Live email sent to ${opts.to} via Gmail SMTP (ID: ${info.messageId})`);
        return;
      } catch (err: any) {
        console.warn('[Email] Gmail SMTP delivery failed:', err.message);
      }
    }

    // 2. Secondary delivery via Resend (if configured)
    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: opts.from || RESEND_FROM,
          to: opts.to,
          subject: opts.subject,
          text: opts.text || '',
          html: opts.html || opts.text || '',
        });
        if (!error) {
          console.log(`[Email] Live email sent to ${opts.to} via Resend (ID: ${data?.id})`);
          return;
        }
        console.warn('[Resend] Delivery notice for', opts.to, ':', error.message);
      } catch (err: any) {
        console.warn('[Resend] Error sending email:', err.message);
      }
    }

    // 3. Fallback: dev console output or production error
    if (isDev) {
      console.log('\n=== EMAIL (DEV) ===');
      console.log(`To: ${opts.to}`);
      console.log(`Subject: ${opts.subject}`);
      if (opts.text) console.log('Text:', opts.text);
      if (opts.html) console.log('HTML:', opts.html);
      console.log('===================\n');
      return;
    }
    throw new Error('Email delivery failed: no transport succeeded');
  },
};
