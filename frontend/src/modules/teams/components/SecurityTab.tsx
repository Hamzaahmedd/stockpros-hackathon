import { DomainAuthPolicy } from '@/modules/auth/types'
import { parseDomainAuthPolicy } from '@/modules/auth/utils/loginPolicy'
import { Modal } from '@/shared/components/Modal'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { teamService } from '../services'
import { SsoReturnResult } from '@/modules/auth/utils/sso'
import { isSsoReady, SSO_TEST_PARAM } from '../ssoUtils'
import type { SsoConfig, Team, TeamDomain } from '../types'
import {
  apiErrorMessage,
  AUTH_POLICIES,
  AUTH_POLICY_LABELS,
  authPolicyChangedMessage,
  canDo,
  isDomainConfirmation,
  isStricterAuthPolicy,
  TeamAction,
} from '../utils'
import { SsoPanel } from './SsoPanel'

interface SecurityTabProps {
  team: Team
  reload: () => void
}

type PendingChange = { domain: TeamDomain; policy: DomainAuthPolicy }

const CONFIRMATION_TEXT: Partial<Record<DomainAuthPolicy, string>> = {
  [DomainAuthPolicy.GOOGLE_ONLY]:
    'Everyone on this domain will be signed out and must sign in with Google from now on. You must be signed in with Google yourself, or you could lock yourself out.',
  [DomainAuthPolicy.GOOGLE_WORKSPACE]:
    'Everyone on this domain will be signed out and must sign in with Google from now on. You must be signed in with Google yourself, or you could lock yourself out.',
  [DomainAuthPolicy.SAML_SSO]:
    'Everyone on this domain will be signed out and must sign in through your identity provider from now on. You must have passed the SSO test yourself, or you could lock yourself out.',
}

/**
 * Sign-in security. Owners choose which methods each verified company domain
 * allows; owners and admins set up single sign-on (SAML) for it.
 */
export function SecurityTab({ team, reload }: Readonly<SecurityTabProps>) {
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  // Which domains have SSO enabled and tested, so only those can be required.
  const [ssoReady, setSsoReady] = useState<Record<string, boolean>>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const isOwner = canDo(team.role, TeamAction.SET_AUTH_POLICY)
  const canManageSso = canDo(team.role, TeamAction.MANAGE_SSO)

  const handleSsoConfig = useCallback(
    (domain: string, config: SsoConfig | null) =>
      setSsoReady((prev) => ({
        ...prev,
        [domain]: config !== null && isSsoReady(config),
      })),
    [],
  )

  // The identity provider sends the browser back here after "Test SSO connection".
  useEffect(() => {
    const result = searchParams.get(SSO_TEST_PARAM)
    if (!result) return
    if (result === SsoReturnResult.PASSED) {
      toast.success('SSO test passed. You can now enable SSO.')
    } else {
      toast.error(
        'The SSO test did not pass. Check the settings and that your email is on this domain.',
      )
    }
    const next = new URLSearchParams(searchParams)
    next.delete(SSO_TEST_PARAM)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const close = () => {
    setPending(null)
    setTyped('')
  }

  const handleSelect = (domain: TeamDomain, value: string) => {
    const policy = parseDomainAuthPolicy(value)
    if (busy || !isOwner || !policy || policy === domain.authPolicy) return
    setPending({ domain, policy })
  }

  const confirm = async () => {
    if (!pending || busy) return
    const { domain, policy } = pending
    setBusy(true)
    try {
      const result = await teamService.setDomainAuthPolicy(
        domain.domain,
        policy,
        isStricterAuthPolicy(policy) ? domain.domain : undefined,
      )
      toast.success(
        authPolicyChangedMessage(domain.domain, policy, result.revokedSessions),
      )
      close()
      reload()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update sign-in policy'))
    } finally {
      setBusy(false)
    }
  }

  const verifiedDomains = team.domains.filter((d) => d.isVerified)
  const stricter = pending !== null && isStricterAuthPolicy(pending.policy)
  const canConfirm =
    pending !== null &&
    (!stricter || isDomainConfirmation(typed, pending.domain.domain))

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Sign-in security</CardTitle>
          <CardDescription>
            Require everyone with an email on a verified company domain to sign
            in with Google or single sign-on. Magic-link login is refused for
            those users.{' '}
            {!isOwner && 'Only the workspace owner can change this.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {team.domains.length === 0 && (
            <p className='text-sm text-muted-foreground'>
              Add and verify a company domain on the Domains tab first.
            </p>
          )}
          <ul className='space-y-3'>
            {team.domains.map((d) => (
              <li key={d.id} className='rounded-lg border border-border p-3'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <span className='font-medium'>{d.domain}</span>
                  <Badge variant={d.isVerified ? 'default' : 'secondary'}>
                    {d.isVerified ? 'Verified' : 'Pending'}
                  </Badge>
                  <label
                    htmlFor={`auth-policy-${d.id}`}
                    className='ml-auto font-medium'
                  >
                    Sign-in method
                  </label>
                  <select
                    id={`auth-policy-${d.id}`}
                    aria-label={`Sign-in method for ${d.domain}`}
                    value={d.authPolicy}
                    disabled={busy || !d.isVerified || !isOwner}
                    onChange={(e) => handleSelect(d, e.target.value)}
                    className='h-8 rounded-md border border-input bg-transparent px-2 text-sm'
                  >
                    {AUTH_POLICIES.filter(
                      (policy) =>
                        policy !== DomainAuthPolicy.SAML_SSO ||
                        d.authPolicy === policy ||
                        ssoReady[d.domain] === true,
                    ).map((policy) => (
                      <option key={policy} value={policy}>
                        {AUTH_POLICY_LABELS[policy]}
                      </option>
                    ))}
                  </select>
                </div>
                {!d.isVerified && (
                  <p className='mt-2 text-xs text-muted-foreground'>
                    Verify this domain to restrict how its users sign in.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>

        {pending && (
          <Modal
            isOpen
            onClose={close}
            title={
              stricter
                ? `Require ${AUTH_POLICY_LABELS[pending.policy]} for ${pending.domain.domain}?`
                : `Allow any sign-in method for ${pending.domain.domain}?`
            }
            description={
              stricter
                ? (CONFIRMATION_TEXT[pending.policy] ?? '')
                : 'Members on this domain will be able to use magic-link login again.'
            }
          >
            <div className='space-y-4'>
              {stricter && (
                <div>
                  <label
                    htmlFor='confirm-domain'
                    className='mb-1 block text-sm font-medium'
                  >
                    Type {pending.domain.domain} to confirm
                  </label>
                  <Input
                    id='confirm-domain'
                    value={typed}
                    autoComplete='off'
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </div>
              )}
              <div className='flex justify-end gap-2'>
                <Button type='button' variant='ghost' onClick={close}>
                  Cancel
                </Button>
                <Button
                  type='button'
                  variant={stricter ? 'destructive' : 'default'}
                  disabled={!canConfirm || busy}
                  onClick={() => void confirm()}
                >
                  {busy ? 'Saving…' : 'Confirm'}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Card>

      {canManageSso && verifiedDomains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Single sign-on (SAML)</CardTitle>
            <CardDescription>
              Let people sign in with your identity provider (Okta, Microsoft
              Entra ID, Ping, Google Workspace). Test it, then enable it.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {verifiedDomains.map((d) => (
              <SsoPanel
                key={d.id}
                domain={d}
                onConfigChange={handleSsoConfig}
                onChanged={reload}
                canEnable={isOwner}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
