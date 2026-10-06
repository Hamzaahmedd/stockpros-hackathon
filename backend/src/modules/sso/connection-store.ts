import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database'
import {
  SsoConfigurationError,
  type SsoConnectionStore,
  type SsoRequestCache,
} from './provider'
import { getKeyValueStore } from './kv-store'

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Connections live in `team_sso_connections`, reached through the domain that
 * owns the tenant id. Pass a transaction client to write alongside the
 * domain/audit changes that belong with it.
 */
export const createConnectionStore = (
  client: DbClient = prisma,
): SsoConnectionStore => ({
  get: async (tenantId) => {
    const row = await client.teamSsoConnection.findFirst({
      where: { domain: { ssoTenantId: tenantId } },
      select: { idpEntityId: true, idpSsoUrl: true, idpCertificate: true },
    })
    return row ?? null
  },
  save: async (tenantId, config, context) => {
    const domain = await client.teamDomain.findUnique({
      where: { ssoTenantId: tenantId },
      select: { id: true },
    })
    if (!domain) throw new SsoConfigurationError('Unknown SSO tenant')
    const data = {
      ...config,
      // Any change to the IdP settings has to be proven again by a test sign-in.
      testedAt: null,
      updatedByUserId: context?.updatedByUserId ?? null,
    }
    await client.teamSsoConnection.upsert({
      where: { domainId: domain.id },
      create: { domainId: domain.id, ...data },
      update: data,
    })
  },
  remove: async (tenantId) => {
    await client.teamSsoConnection.deleteMany({
      where: { domain: { ssoTenantId: tenantId } },
    })
  },
})

/** In-flight SAML request ids, shared across API instances through the key-value store. */
export const createRequestCache = (): SsoRequestCache => ({
  save: (key, value, ttlMs) =>
    getKeyValueStore().set(`req:${key}`, value, ttlMs),
  get: (key) => getKeyValueStore().get(`req:${key}`),
  take: (key) => getKeyValueStore().take(`req:${key}`),
})
