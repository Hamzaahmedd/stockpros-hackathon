import {
  buildPaymentReceiptEmail,
  buildPaymentReceiptEmailHtml,
  buildPaymentReceiptEmailText,
  buildPaymentReceiptSubject,
  type PaymentReceiptData,
} from './payment-receipt'

const data: PaymentReceiptData = {
  teamName: 'Alpha Fund',
  referenceNumber: 'SP-2030-000000C1',
  description: 'Team plan subscription',
  amount: 'Rs 14,998',
  seatCount: 2,
  paidOn: 'Mar 5, 2030',
  manageUrl: 'https://app.example/teams',
}

describe('payment receipt email', () => {
  it('puts the reference in the subject', () => {
    expect(buildPaymentReceiptSubject(data)).toBe(
      'Your StockPros payment receipt SP-2030-000000C1',
    )
  })

  it('lists every detail in the text version, unescaped', () => {
    const text = buildPaymentReceiptEmailText({
      ...data,
      teamName: 'Ann & Bob <Fund>',
    })
    expect(text).toContain('Workspace: Ann & Bob <Fund>')
    expect(text).toContain('Reference: SP-2030-000000C1')
    expect(text).toContain('Seats: 2')
    expect(text).toContain('Amount: Rs 14,998')
    expect(text).toContain('Paid on: Mar 5, 2030')
    expect(text).toContain('https://app.example/teams')
  })

  it('renders the same details in the HTML version', () => {
    const html = buildPaymentReceiptEmailHtml(data)
    for (const value of [
      'Alpha Fund',
      'SP-2030-000000C1',
      'Team plan subscription',
      'Rs 14,998',
      'Mar 5, 2030',
    ]) {
      expect(html).toContain(value)
    }
    expect(html).toContain('href="https://app.example/teams"')
    expect(html).toContain('src="cid:logo"')
  })

  it('escapes everything user-controlled in the HTML', () => {
    const html = buildPaymentReceiptEmailHtml(
      {
        ...data,
        teamName: '<img src=x onerror=alert(1)>"',
        manageUrl: 'https://app.example/teams?a=1&b="x" onclick="alert(1)',
      },
      'x" onerror="alert(1)',
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;')
    expect(html).not.toContain('onclick="alert(1)"')
    expect(html).not.toContain('onerror="alert(1)')
  })

  it('builds the all-in-one object with a custom logo', () => {
    const email = buildPaymentReceiptEmail(data, 'https://cdn/logo.png')
    expect(email.subject).toBe(buildPaymentReceiptSubject(data))
    expect(email.html).toContain('https://cdn/logo.png')
    expect(email.text).toBe(buildPaymentReceiptEmailText(data))
  })
})
