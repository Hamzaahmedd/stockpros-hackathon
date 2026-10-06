const mockKv = {
  set: jest.fn(),
  get: jest.fn(),
  take: jest.fn(),
}
jest.mock('../../../shared/infrastructure/database', () => ({ prisma: {} }))
jest.mock('../kv-store', () => ({ getKeyValueStore: () => mockKv }))

import { createConnectionStore, createRequestCache } from '../connection-store'
import { SsoConfigurationError } from '../provider'

const CONFIG = {
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'cert',
}

const client = () => ({
  teamSsoConnection: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  teamDomain: { findUnique: jest.fn() },
})

afterEach(() => jest.resetAllMocks())

describe('createConnectionStore', () => {
  it('reads a connection through the domain that owns the tenant', async () => {
    const db = client()
    db.teamSsoConnection.findFirst.mockResolvedValue(CONFIG)

    await expect(createConnectionStore(db as never).get('t1')).resolves.toEqual(
      CONFIG,
    )
    expect(db.teamSsoConnection.findFirst.mock.calls[0][0].where).toEqual({
      domain: { ssoTenantId: 't1' },
    })
  })

  it('returns null for a tenant with no connection', async () => {
    const db = client()
    db.teamSsoConnection.findFirst.mockResolvedValue(null)

    await expect(
      createConnectionStore(db as never).get('t1'),
    ).resolves.toBeNull()
  })

  it('saves by domain, clears the test result and records who changed it', async () => {
    const db = client()
    db.teamDomain.findUnique.mockResolvedValue({ id: 'dom-1' })

    await createConnectionStore(db as never).save('t1', CONFIG, {
      updatedByUserId: 'admin-1',
    })

    const call = db.teamSsoConnection.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ domainId: 'dom-1' })
    expect(call.create).toMatchObject({
      domainId: 'dom-1',
      ...CONFIG,
      testedAt: null,
      updatedByUserId: 'admin-1',
    })
    expect(call.update).toMatchObject({ testedAt: null })
  })

  it('records no actor when none is given', async () => {
    const db = client()
    db.teamDomain.findUnique.mockResolvedValue({ id: 'dom-1' })

    await createConnectionStore(db as never).save('t1', CONFIG)

    expect(
      db.teamSsoConnection.upsert.mock.calls[0][0].update.updatedByUserId,
    ).toBeNull()
  })

  it('refuses to save for an unknown tenant', async () => {
    const db = client()
    db.teamDomain.findUnique.mockResolvedValue(null)

    await expect(
      createConnectionStore(db as never).save('nope', CONFIG),
    ).rejects.toBeInstanceOf(SsoConfigurationError)
    expect(db.teamSsoConnection.upsert).not.toHaveBeenCalled()
  })

  it('removes the connection of a tenant', async () => {
    const db = client()

    await createConnectionStore(db as never).remove('t1')

    expect(db.teamSsoConnection.deleteMany).toHaveBeenCalledWith({
      where: { domain: { ssoTenantId: 't1' } },
    })
  })
})

describe('createRequestCache', () => {
  it('namespaces request ids in the shared key-value store', async () => {
    mockKv.get.mockResolvedValue('v')
    mockKv.take.mockResolvedValue('v')
    const cache = createRequestCache()

    await cache.save('k', 'v', 1000)
    await expect(cache.get('k')).resolves.toBe('v')
    await expect(cache.take('k')).resolves.toBe('v')

    expect(mockKv.set).toHaveBeenCalledWith('req:k', 'v', 1000)
    expect(mockKv.get).toHaveBeenCalledWith('req:k')
    expect(mockKv.take).toHaveBeenCalledWith('req:k')
  })
})
