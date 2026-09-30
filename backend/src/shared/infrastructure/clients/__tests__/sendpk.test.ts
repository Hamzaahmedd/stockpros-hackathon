const mockPost = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => ({ post: mockPost })) },
}))

jest.mock('../../logger', () => ({
  logger: { error: jest.fn() },
}))

const loadClient = (sendpkOverrides: Record<string, unknown>) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      sendpk: { ...actual.default.sendpk, ...sendpkOverrides },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../sendpk') as typeof import('../sendpk')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('sendWhatsappOtp — mock provider', () => {
  it('logs to the console instead of sending, and never calls the logger or axios', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const { sendWhatsappOtp } = loadClient({ mockProvider: true })

    await sendWhatsappOtp({ phoneNumber: '+923001234567', code: '1234' })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Would send WhatsApp OTP 1234 to +923001234567'),
    )
    expect(mockPost).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe('sendWhatsappOtp — live provider', () => {
  it('throws when the API key or template id is not configured', async () => {
    const { sendWhatsappOtp } = loadClient({
      mockProvider: false,
      apiKey: '',
      templateId: 'tmpl_1',
    })

    await expect(
      sendWhatsappOtp({ phoneNumber: '+923001234567', code: '1234' }),
    ).rejects.toThrow(
      'SendPK is not configured (missing SENDPK_API_KEY or SENDPK_TEMPLATE_ID)',
    )
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('strips the leading + and posts the correctly-shaped payload', async () => {
    mockPost.mockResolvedValue({ data: { success: true } })
    const { sendWhatsappOtp } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      templateId: 'tmpl_1',
    })

    await sendWhatsappOtp({ phoneNumber: '+923001234567', code: '5678' })

    expect(mockPost).toHaveBeenCalledWith('', {
      api_key: 'live-key',
      template_id: 'tmpl_1',
      template_data: [
        { mobile: '923001234567', body: [{ type: 'text', text: '5678' }] },
      ],
    })
  })

  it('wraps a send failure, logging the original error', async () => {
    mockPost.mockRejectedValue(new Error('network down'))
    const { sendWhatsappOtp } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      templateId: 'tmpl_1',
    })
    const { logger } = jest.requireMock('../../logger') as {
      logger: { error: jest.Mock }
    }

    await expect(
      sendWhatsappOtp({ phoneNumber: '+923001234567', code: '5678' }),
    ).rejects.toThrow('Failed to send WhatsApp OTP')
    expect(logger.error).toHaveBeenCalledWith(
      '[SendPK] Failed to send WhatsApp OTP',
      expect.any(Error),
    )
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
