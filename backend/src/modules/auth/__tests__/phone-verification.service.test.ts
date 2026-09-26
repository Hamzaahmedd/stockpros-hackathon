import {
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../../shared/errors'
import { hashToken } from '../../../shared/utils'
import { requestOtp, verifyOtp } from '../service'

// service.ts transitively imports notifications/public -> ... -> alert-evaluator
// -> socket-server -> finnhub-stream, whose module-level singleton opens a real
// WebSocket connection on import. Mock it so this unit test never touches the
// network (matches the same mock already used in service.test.ts).
jest.mock('../../market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100, d: 1 }),
  },
}))

// Mock the SendPK client so requestOtp never makes a real HTTP call —
// captures the plaintext OTP so the "full flow" test can feed it into
// verifyOtp without needing to know the internal crypto.randomInt output.
jest.mock('../../../shared/infrastructure/clients/sendpk', () => ({
  sendWhatsappOtp: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    phoneOtp: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { sendWhatsappOtp } from '../../../shared/infrastructure/clients/sendpk'
import { prisma } from '../../../shared/infrastructure/database'

const mockedSendWhatsappOtp = sendWhatsappOtp as jest.Mock
const mockedUserFindUnique = prisma.user.findUnique as jest.Mock
const mockedUserUpdate = prisma.user.update as jest.Mock
const mockedOtpFindFirst = prisma.phoneOtp.findFirst as jest.Mock
const mockedOtpCreate = prisma.phoneOtp.create as jest.Mock
const mockedOtpUpdate = prisma.phoneOtp.update as jest.Mock
const mockedOtpUpdateMany = prisma.phoneOtp.updateMany as jest.Mock
const mockedTransaction = prisma.$transaction as jest.Mock

const userId = 'user-uuid-123'
const canonicalPhone = '+923001234567'

describe('Auth Service - phone verification (WhatsApp OTP)', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default: user exists and no other account owns this phone number.
    mockedUserFindUnique.mockImplementation(({ where }) => {
      if (where.id === userId) return Promise.resolve({ id: userId })
      if (where.phoneNumber === canonicalPhone) return Promise.resolve(null)
      return Promise.resolve(null)
    })

    mockedOtpFindFirst.mockResolvedValue(null)
    mockedOtpCreate.mockResolvedValue({})
    mockedOtpUpdateMany.mockResolvedValue({ count: 0 })
    mockedOtpUpdate.mockResolvedValue({})
    mockedUserUpdate.mockResolvedValue({})
    mockedTransaction.mockImplementation((ops: unknown[]) => Promise.all(ops))
  })

  describe('requestOtp', () => {
    it('normalizes the phone, stores a hashed code, and dispatches via SendPK — never the raw code', async () => {
      await requestOtp(userId, '0300 123 4567')

      expect(mockedOtpCreate).toHaveBeenCalledTimes(1)
      const createArgs = mockedOtpCreate.mock.calls[0][0]
      expect(createArgs.data.userId).toBe(userId)
      expect(createArgs.data.phoneNumber).toBe(canonicalPhone)
      expect(createArgs.data.codeHash).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
      expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now())

      expect(mockedSendWhatsappOtp).toHaveBeenCalledTimes(1)
      const sendArgs = mockedSendWhatsappOtp.mock.calls[0][0]
      expect(sendArgs.phoneNumber).toBe(canonicalPhone)
      expect(sendArgs.code).toMatch(/^\d{6}$/)
      // The code SendPK was asked to send must match what was hashed & stored.
      expect(hashToken(sendArgs.code)).toBe(createArgs.data.codeHash)
    })

    it('invalidates all previous unconsumed PhoneOtp rows before creating a new one', async () => {
      await requestOtp(userId, '03001234567')

      expect(mockedOtpUpdateMany).toHaveBeenCalledWith({
        where: { userId, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      })
      // Order matters: prior rows must be invalidated before the new row is created.
      const invalidateOrder = mockedOtpUpdateMany.mock.invocationCallOrder[0]
      const createOrder = mockedOtpCreate.mock.invocationCallOrder[0]
      expect(invalidateOrder).toBeLessThan(createOrder)
    })

    it('rejects with ValidationError for a non-Pakistani / malformed number, before touching the DB', async () => {
      await expect(requestOtp(userId, 'not-a-number')).rejects.toThrow(
        ValidationError,
      )
      expect(mockedUserFindUnique).not.toHaveBeenCalled()
      expect(mockedSendWhatsappOtp).not.toHaveBeenCalled()
    })

    it('throws NotFoundError when the user does not exist', async () => {
      mockedUserFindUnique.mockResolvedValueOnce(null)

      await expect(requestOtp(userId, '03001234567')).rejects.toThrow(
        NotFoundError,
      )
      expect(mockedSendWhatsappOtp).not.toHaveBeenCalled()
    })

    it('throws ValidationError when the number is already verified on another account', async () => {
      mockedUserFindUnique.mockImplementation(({ where }) => {
        if (where.id === userId) return Promise.resolve({ id: userId })
        if (where.phoneNumber === canonicalPhone) {
          return Promise.resolve({
            id: 'some-other-user',
            phoneVerifiedAt: new Date(),
          })
        }
        return Promise.resolve(null)
      })

      await expect(requestOtp(userId, '03001234567')).rejects.toThrow(
        ValidationError,
      )
      expect(mockedSendWhatsappOtp).not.toHaveBeenCalled()
    })

    it('allows the SAME user to re-request for a phone number they already own but have not verified', async () => {
      mockedUserFindUnique.mockImplementation(({ where }) => {
        if (where.id === userId) return Promise.resolve({ id: userId })
        if (where.phoneNumber === canonicalPhone) {
          return Promise.resolve({ id: userId, phoneVerifiedAt: null })
        }
        return Promise.resolve(null)
      })

      await expect(requestOtp(userId, '03001234567')).resolves.toBeUndefined()
      expect(mockedSendWhatsappOtp).toHaveBeenCalledTimes(1)
    })

    it('rejects with 429 TooManyRequestsError when re-requested within the 60s cooldown', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        createdAt: new Date(Date.now() - 10 * 1000), // 10s ago — inside cooldown
      })

      await expect(requestOtp(userId, '03001234567')).rejects.toThrow(
        TooManyRequestsError,
      )
      // Cooldown must reject before ever invalidating rows / creating a new code / sending.
      expect(mockedOtpUpdateMany).not.toHaveBeenCalled()
      expect(mockedOtpCreate).not.toHaveBeenCalled()
      expect(mockedSendWhatsappOtp).not.toHaveBeenCalled()
    })

    it('allows a new request once the 60s cooldown has elapsed', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        createdAt: new Date(Date.now() - 61 * 1000), // just past cooldown
      })

      await expect(requestOtp(userId, '03001234567')).resolves.toBeUndefined()
      expect(mockedSendWhatsappOtp).toHaveBeenCalledTimes(1)
    })

    it('never calls the real SendPK HTTP client — only the mocked module', async () => {
      await requestOtp(userId, '03001234567')
      // sendWhatsappOtp is entirely mocked at the module boundary; asserting
      // it was called (not axios) is the guarantee that no real network
      // request could have been made from this test.
      expect(mockedSendWhatsappOtp).toHaveBeenCalled()
    })
  })

  describe('verifyOtp', () => {
    const validCode = '654321'
    const validCodeHash = hashToken(validCode)

    it('verifies a correct, unexpired code and marks the user verified', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        phoneNumber: canonicalPhone,
        codeHash: validCodeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60 * 1000),
        consumedAt: null,
      })

      await expect(verifyOtp(userId, validCode)).resolves.toBeUndefined()

      expect(mockedTransaction).toHaveBeenCalledTimes(1)
      expect(mockedOtpUpdate).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { consumedAt: expect.any(Date) },
      })
    })

    it('rejects an invalid (non 6-digit) code with ValidationError before hitting the DB', async () => {
      await expect(verifyOtp(userId, 'abc')).rejects.toThrow(ValidationError)
      expect(mockedOtpFindFirst).not.toHaveBeenCalled()
    })

    it('throws UnauthorizedError when there is no pending OTP', async () => {
      mockedOtpFindFirst.mockResolvedValue(null)

      await expect(verifyOtp(userId, validCode)).rejects.toThrow(
        UnauthorizedError,
      )
    })

    it('throws UnauthorizedError for an expired code', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        phoneNumber: canonicalPhone,
        codeHash: validCodeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000), // already expired
        consumedAt: null,
      })

      await expect(verifyOtp(userId, validCode)).rejects.toThrow(
        UnauthorizedError,
      )
      expect(mockedTransaction).not.toHaveBeenCalled()
    })

    it('increments attempts and throws UnauthorizedError for an incorrect code', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        phoneNumber: canonicalPhone,
        codeHash: validCodeHash,
        attempts: 2,
        expiresAt: new Date(Date.now() + 60 * 1000),
        consumedAt: null,
      })

      await expect(verifyOtp(userId, '000000')).rejects.toThrow(
        UnauthorizedError,
      )
      expect(mockedOtpUpdate).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      })
      expect(mockedTransaction).not.toHaveBeenCalled()
    })

    it('locks out verification with TooManyRequestsError once attempts reach the cap (5)', async () => {
      mockedOtpFindFirst.mockResolvedValue({
        id: 'otp-1',
        userId,
        phoneNumber: canonicalPhone,
        codeHash: validCodeHash,
        attempts: 5,
        expiresAt: new Date(Date.now() + 60 * 1000),
        consumedAt: null,
      })

      // Even the CORRECT code must be rejected once the attempts cap is hit.
      await expect(verifyOtp(userId, validCode)).rejects.toThrow(
        TooManyRequestsError,
      )
      expect(mockedOtpUpdate).not.toHaveBeenCalled()
      expect(mockedTransaction).not.toHaveBeenCalled()
    })
  })

  describe('full requestOtp -> verifyOtp flow (mocked SendPK + Prisma, no real DB/network)', () => {
    it('lets a user verify with the exact code that was "sent"', async () => {
      // Simulate the PhoneOtp table with a tiny in-memory row so requestOtp's
      // create() and verifyOtp's findFirst() see consistent state.
      let storedRow: {
        id: string
        userId: string
        phoneNumber: string
        codeHash: string
        attempts: number
        expiresAt: Date
        consumedAt: Date | null
      } | null = null

      mockedOtpFindFirst.mockImplementation(() => Promise.resolve(storedRow))
      mockedOtpCreate.mockImplementation(({ data }) => {
        storedRow = { id: 'otp-1', attempts: 0, consumedAt: null, ...data }
        return Promise.resolve(storedRow)
      })
      mockedOtpUpdate.mockImplementation(({ data }) => {
        if (storedRow) storedRow = { ...storedRow, ...data }
        return Promise.resolve(storedRow)
      })

      await requestOtp(userId, '03001234567')

      const sentCode = mockedSendWhatsappOtp.mock.calls[0][0].code as string

      await expect(verifyOtp(userId, sentCode)).resolves.toBeUndefined()
      expect(mockedTransaction).toHaveBeenCalledTimes(1)
    })
  })
})
