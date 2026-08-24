import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'StockPros <onboarding@resend.dev>';
const isDev = process.env.NODE_ENV !== 'production';

// Load logo for email templates (optional)
const logoPath = path.resolve(__dirname, '../../../modules/notifications/email-templates/stockpros-logo.png');
let logoBase64: string | undefined;
try {
  const buffer = fs.readFileSync(logoPath);
  logoBase64 = buffer.toString('base64');
} catch (_) {
  // Logo is optional; ignore errors
}

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
