import { useSyncExternalStore } from 'react'
import { isRecord } from './type-guards'

/**
 * The workspace's AI instructions ("orgContext"), as last returned by a
 * forecast / market-decision / radar response. The backend attaches it for
 * team members; the axios response interceptor keeps this store in sync (and
 * clears it when a response carries none, e.g. after leaving a workspace).
 */
let current: string | null = null
const listeners = new Set<() => void>()

export const setOrgContext = (value: string | null | undefined): void => {
  const next = value?.trim() ? value : null
  if (next === current) return
  current = next
  listeners.forEach((listener) => listener())
}

export const getOrgContext = (): string | null => current

/** The `orgContext` string of a response body, or undefined if absent or not a string. */
export const readOrgContext = (body: unknown): string | undefined =>
  isRecord(body) && typeof body.orgContext === 'string'
    ? body.orgContext
    : undefined

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useOrgContext = (): string | null =>
  useSyncExternalStore(subscribe, getOrgContext, getOrgContext)
