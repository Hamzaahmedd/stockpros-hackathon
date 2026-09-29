const mockSmtpSendMail = jest.fn()
const mockCreateTransport = jest.fn((..._args: unknown[]) => ({
  sendMail: mockSmtpSendMail,
}))

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: mockCreateTransport },
}))

const mockResendSend = jest.fn()
const mockResendCtor = jest.fn((..._args: unknown[]) => ({
  emails: { send: mockResendSend },
}))

jest.mock('resend', () => ({
  __esModule: true,
  Resend: mockResendCtor,
}))

const mockAxiosGet = jest.fn<Promise<any>, any[]>()
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
}))

const mockExistsSync = jest.fn<boolean, any[]>()
const mockReadFileSync = jest.fn<Buffer, any[]>()
jest.mock('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
jest.mock('../../logger', () => ({ logger: mockLogger }))

type Overrides = {
  smtp?: Record<string, unknown>
  email?: Record<string, unknown>
  server?: Record<string, unknown>
  brand?: Record<string, unknown>
}

const loadEmailModule = (overrides: Overrides = {}) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      smtp: { ...actual.default.smtp, ...(overrides.smtp || {}) },
      email: { ...actual.default.email, ...(overrides.email || {}) },
      server: { ...actual.default.server, ...(overrides.server || {}) },
      brand: { ...actual.default.brand, ...(overrides.brand || {}) },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../email') as typeof import('../email')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockExistsSync.mockReturnValue(false)
})

describe('getLogoSrc', () => {
  it('returns cid:logo when SMTP is the active transport', () => {
    const { getLogoSrc } = loadEmailModule()
    expect(getLogoSrc()).toBe('cid:logo')
  })

  it('returns the public logo URL when only Resend is active and a logo URL is configured', () => {
    const { getLogoSrc } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: 'key' },
      brand: { logoUrl: 'https://cdn.example/logo.png' },
    })
    expect(getLogoSrc()).toBe('https://cdn.example/logo.png')
  })

  it('falls back to cid:logo when only Resend is active but no logo URL is configured', () => {
    const { getLogoSrc } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: 'key' },
      brand: { logoUrl: '' },
    })
    expect(getLogoSrc()).toBe('cid:logo')
  })

  it('returns cid:logo when neither transport is configured', () => {
    const { getLogoSrc } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: '' },
    })
    expect(getLogoSrc()).toBe('cid:logo')
  })
})

describe('transporter.sendMail — SMTP path', () => {
  it('sends via SMTP, fetching and attaching the remote logo, and caches it across calls', async () => {
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('logo-bytes') })
    mockSmtpSendMail.mockResolvedValue({ messageId: 'msg-1' })
    const { transporter } = loadEmailModule({
      brand: { logoUrl: 'https://cdn.example/logo.png' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })
    await transporter.sendMail({ to: 'c@d.com', subject: 'Hi again' })

    expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    expect(mockSmtpSendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'a@b.com',
        attachments: [
          expect.objectContaining({
            filename: 'stockpros-logo.png',
            cid: 'logo',
          }),
        ],
      }),
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Live email sent to a@b.com via SMTP (ID: msg-1)',
      ),
    )
  })

  it('falls back to the local logo file when the remote fetch fails', async () => {
    mockAxiosGet.mockRejectedValue(new Error('timeout'))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(Buffer.from('local-logo'))
    mockSmtpSendMail.mockResolvedValue({ messageId: 'msg-2' })
    const { transporter } = loadEmailModule({
      brand: { logoUrl: 'https://cdn.example/logo.png' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Logo fetch failed, falling back to local file'),
    )
    expect(mockSmtpSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ filename: 'stockpros-logo.png' }),
        ],
      }),
    )
  })

  it('sends with no attachment when there is no remote logo URL and no local file', async () => {
    mockExistsSync.mockReturnValue(false)
    mockSmtpSendMail.mockResolvedValue({ messageId: 'msg-3' })
    const { transporter } = loadEmailModule({ brand: { logoUrl: '' } })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockAxiosGet).not.toHaveBeenCalled()
    expect(mockSmtpSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: undefined }),
    )
  })

  it('does not fail the send when the local logo file read throws', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('fs error')
    })
    mockSmtpSendMail.mockResolvedValue({ messageId: 'msg-4' })
    const { transporter } = loadEmailModule({ brand: { logoUrl: '' } })

    await expect(
      transporter.sendMail({ to: 'a@b.com', subject: 'Hi' }),
    ).resolves.toBeUndefined()
  })

  it('formats a string rejection reason without wrapping it in an Error message lookup', async () => {
    mockSmtpSendMail.mockRejectedValue('raw string failure')
    const { transporter } = loadEmailModule({ email: { resendApiKey: '' } })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SMTP delivery failed: raw string failure'),
    )
  })

  it('falls back to String(err) when a non-Error, non-string rejection cannot be JSON-stringified', async () => {
    const circular: any = {}
    circular.self = circular
    mockSmtpSendMail.mockRejectedValue(circular)
    const { transporter } = loadEmailModule({ email: { resendApiKey: '' } })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SMTP delivery failed: [object Object]'),
    )
  })

  it('falls through to Resend when SMTP delivery throws and Resend is also enabled', async () => {
    mockSmtpSendMail.mockRejectedValue(new Error('smtp down'))
    mockResendSend.mockResolvedValue({ data: { id: 'r-1' }, error: null })
    const { transporter } = loadEmailModule({
      email: { resendApiKey: 'key' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SMTP delivery failed'),
    )
    expect(mockResendSend).toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Live email sent to a@b.com via Resend (ID: r-1)',
      ),
    )
  })

  it('throws when SMTP fails, there is no Resend fallback, and the environment is not dev', async () => {
    mockSmtpSendMail.mockRejectedValue(new Error('smtp down'))
    const { transporter } = loadEmailModule({
      email: { resendApiKey: '' },
      server: { nodeEnv: 'production' },
    })

    await expect(
      transporter.sendMail({ to: 'a@b.com', subject: 'Hi' }),
    ).rejects.toThrow(
      'Email delivery failed: SMTP failed and no fallback transport is enabled',
    )
  })

  it('falls back to dev console logging when SMTP fails, no Resend, and the environment is dev', async () => {
    mockSmtpSendMail.mockRejectedValue(new Error('smtp down'))
    const { transporter } = loadEmailModule({ email: { resendApiKey: '' } })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi', text: 'body' })

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Email][DEV] To: a@b.com'),
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Email][DEV] Text: body'),
    )
  })
})

describe('transporter.sendMail — Resend-only path', () => {
  it('sends successfully via Resend when SMTP is disabled', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'r-2' }, error: null })
    const { transporter } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: 'key' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockResendSend).toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('via Resend (ID: r-2)'),
    )
  })

  it('logs a warning and treats it as failed delivery when Resend returns an error field', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'invalid domain' },
    })
    const { transporter } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: 'key' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Delivery notice for a@b.com: invalid domain'),
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Email][DEV] To: a@b.com'),
    )
  })

  it('catches an exception thrown by Resend and falls through to dev logging', async () => {
    mockResendSend.mockRejectedValue(new Error('resend down'))
    const { transporter } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: 'key' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error sending email: resend down'),
    )
  })
})

describe('transporter.sendMail — no transport configured', () => {
  it('logs to dev console when neither SMTP nor Resend is configured, in dev', async () => {
    const { transporter } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: '' },
    })

    await transporter.sendMail({ to: 'a@b.com', subject: 'Hi' })

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Email][DEV] To: a@b.com'),
    )
  })

  it('throws when neither transport is configured and the environment is not dev', async () => {
    const { transporter } = loadEmailModule({
      smtp: { user: '', pass: '' },
      email: { resendApiKey: '' },
      server: { nodeEnv: 'production' },
    })

    await expect(
      transporter.sendMail({ to: 'a@b.com', subject: 'Hi' }),
    ).rejects.toThrow('Email delivery failed: no transport succeeded')
  })
})
