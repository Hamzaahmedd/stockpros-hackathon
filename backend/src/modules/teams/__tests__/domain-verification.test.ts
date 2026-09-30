jest.mock('node:dns', () => ({
  __esModule: true,
  default: { promises: { resolveTxt: jest.fn() } },
}))

import dns from 'node:dns'
import {
  checkDomainTxtRecord,
  verificationRecordName,
  verificationRecordValue,
} from '../domain-verification'

const resolveTxt = dns.promises.resolveTxt as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('record helpers', () => {
  it('builds the record name and value', () => {
    expect(verificationRecordName('fund.com')).toBe(
      '_stockpros-verify.fund.com',
    )
    expect(verificationRecordValue('abc')).toBe('stockpros-verification=abc')
  })
})

describe('checkDomainTxtRecord', () => {
  it('returns true when a TXT record matches', async () => {
    resolveTxt.mockResolvedValue([['other'], ['stockpros-verification=tok']])
    await expect(checkDomainTxtRecord('fund.com', 'tok')).resolves.toBe(true)
    expect(resolveTxt).toHaveBeenCalledWith('_stockpros-verify.fund.com')
  })

  it('returns true for a value split across TXT chunks', async () => {
    resolveTxt.mockResolvedValue([['stockpros-verifi', 'cation=tok']])
    await expect(checkDomainTxtRecord('fund.com', 'tok')).resolves.toBe(true)
  })

  it('returns false when no record matches', async () => {
    resolveTxt.mockResolvedValue([['stockpros-verification=wrong']])
    await expect(checkDomainTxtRecord('fund.com', 'tok')).resolves.toBe(false)
  })

  it('returns false when the resolver throws an Error', async () => {
    resolveTxt.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(checkDomainTxtRecord('fund.com', 'tok')).resolves.toBe(false)
  })

  it('returns false when the resolver rejects with a non-Error', async () => {
    resolveTxt.mockRejectedValue('boom')
    await expect(checkDomainTxtRecord('fund.com', 'tok')).resolves.toBe(false)
  })
})
