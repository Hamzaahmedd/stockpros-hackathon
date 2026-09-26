/**
 * Regression guard for the documented SendPK WhatsApp template request shape
 * (confirmed against https://wa.sendpk.com/api.php): `api_key` (not
 * `apikey`), and the recipient + template variables nested inside
 * `template_data[0]` (`mobile` + a `body` array of `{type: "text", text}`
 * entries) rather than top-level `phone`/`variables` fields, which the
 * documented endpoint does not recognize.
 */

const mockPost = jest.fn().mockResolvedValue({ data: { success: 'true' } })

jest.mock('axios', () => ({
  create: jest.fn(() => ({ post: mockPost })),
}))

jest.mock('@/config', () => {
  const actual = jest.requireActual('@/config')
  const patched = {
    ...actual.default,
    sendpk: {
      ...actual.default.sendpk,
      mockProvider: false,
      apiKey: 'test-api-key',
      templateId: 'test-template-id',
    },
  }
  return {
    __esModule: true,
    default: patched,
    config: patched,
  }
})

import { sendWhatsappOtp } from './sendpk'

describe('sendWhatsappOtp', () => {
  beforeEach(() => {
    mockPost.mockClear()
  })

  it('sends the documented request shape (api_key, template_data[].mobile/body)', async () => {
    await sendWhatsappOtp({ phoneNumber: '+923001234567', code: '654321' })

    expect(mockPost).toHaveBeenCalledWith('', {
      api_key: 'test-api-key',
      template_id: 'test-template-id',
      template_data: [
        {
          mobile: '923001234567',
          body: [{ type: 'text', text: '654321' }],
        },
      ],
    })
  })

  it('strips the leading + from the E.164 number for the recipient field', async () => {
    await sendWhatsappOtp({ phoneNumber: '+923219876543', code: '111111' })

    const payload = mockPost.mock.calls[0][1]
    expect(payload.template_data[0].mobile).toBe('923219876543')
  })
})
