import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

export interface PaymentReceiptData {
  teamName: string
  referenceNumber: string
  description: string
  /** Pre-formatted, e.g. "Rs 14,998". */
  amount: string
  seatCount: number
  /** Pre-formatted date the payment completed. */
  paidOn: string
  manageUrl: string
}

export const buildPaymentReceiptSubject = (
  data: Pick<PaymentReceiptData, 'referenceNumber'>,
): string => `Your StockPros payment receipt ${data.referenceNumber}`

export const buildPaymentReceiptEmailText = (
  data: PaymentReceiptData,
): string => `
Payment received — thank you

Workspace: ${data.teamName}
Reference: ${data.referenceNumber}
Item: ${data.description}
Seats: ${data.seatCount}
Amount: ${data.amount}
Paid on: ${data.paidOn}

View billing history and download receipts: ${data.manageUrl}
`

const detailRow = (label: string, value: string): string => `
        <tr>
          <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">${label}</td>
          <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${escapeHtml(value)}</td>
        </tr>`

export const buildPaymentReceiptEmailHtml = (
  data: PaymentReceiptData,
  logoSrc = 'cid:logo',
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(buildPaymentReceiptSubject(data))}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px;">
      <div style="text-align: left; margin-bottom: 28px;">
        <img src="${escapeHtml(logoSrc)}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle; display: inline-block;">
          Stock<span style="color: #06b6d4;">Pros</span>
        </span>
      </div>

      <p style="color: #e6edf3; font-size: 18px; font-weight: 600; margin-bottom: 16px;">Payment received — thank you</p>
      <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #30363d; border-bottom: 1px solid #30363d; margin-bottom: 24px;">${detailRow('Workspace', data.teamName)}${detailRow('Reference', data.referenceNumber)}${detailRow('Item', data.description)}${detailRow('Seats', String(data.seatCount))}${detailRow('Amount', data.amount)}${detailRow('Paid on', data.paidOn)}
      </table>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(data.manageUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
          View billing history
        </a>
      </div>

      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>
    </div>
  </body>
</html>
`

export const buildPaymentReceiptEmail = (
  data: PaymentReceiptData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildPaymentReceiptSubject(data),
  html: buildPaymentReceiptEmailHtml(data, logoSrc),
  text: buildPaymentReceiptEmailText(data),
})
