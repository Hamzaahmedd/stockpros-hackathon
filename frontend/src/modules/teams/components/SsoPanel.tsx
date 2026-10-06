import { DomainAuthPolicy } from '@/modules/auth/types'
import { Modal } from '@/shared/components/Modal'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { apiErrorBody } from '@/shared/utils/api-error'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { teamService } from '../services'
import {
  buildSsoInput,
  CertificateExpiryState,
  certificateExpiryState,
  EMPTY_SSO_FORM,
  isSafeIdpUrl,
  SSO_FEATURE_DISABLED_CODE,
  SSO_PROVIDER_PRESETS,
  SSO_STATUS_LABELS,
  ssoStatus,
  SsoStatus,
  type SsoFormValues,
} from '../ssoUtils'
import type { SsoConfig, TeamDomain } from '../types'
import { apiErrorMessage, formatDate } from '../utils'
import { CopyValue } from './CopyValue'
import { SsoSetupForm } from './SsoSetupForm'

interface SsoPanelProps {
  domain: TeamDomain
  /** Tells the page whether SSO can be required for this domain (enabled and tested). */
  onConfigChange: (domain: string, config: SsoConfig | null) => void
  /** Something other pages show (such as the domain's policy) may have changed. */
  onChanged: () => void
  /** Switching SSO on is the owner's call; admins can configure, test and switch it off. */
  canEnable: boolean
}

enum LoadState {
  LOADING = 'LOADING',
  READY = 'READY',
  UNAVAILABLE = 'UNAVAILABLE',
  ERROR = 'ERROR',
}

const STATUS_VARIANT: Record<SsoStatus, 'default' | 'secondary'> = {
  [SsoStatus.NOT_CONFIGURED]: 'secondary',
  [SsoStatus.NEEDS_TEST]: 'secondary',
  [SsoStatus.READY]: 'secondary',
  [SsoStatus.ENABLED]: 'default',
  [SsoStatus.REQUIRED]: 'default',
}

/** One verified domain's SAML setup: values for the IdP, the IdP's settings, a test sign-in and the on/off switch. */
export function SsoPanel({
  domain,
  onConfigChange,
  onChanged,
  canEnable,
}: Readonly<SsoPanelProps>) {
  const name = domain.domain
  const [config, setConfig] = useState<SsoConfig | null>(null)
  const [loadState, setLoadState] = useState<LoadState>(LoadState.LOADING)
  const [form, setForm] = useState<SsoFormValues>(EMPTY_SSO_FORM)
  const [presetId, setPresetId] = useState(SSO_PROVIDER_PRESETS[0].id)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const apply = useCallback(
    (next: SsoConfig | null) => {
      setConfig(next)
      onConfigChange(name, next)
    },
    [name, onConfigChange],
  )

  const load = useCallback(async () => {
    setLoadState(LoadState.LOADING)
    try {
      apply(await teamService.getSsoConfig(name))
      setLoadState(LoadState.READY)
    } catch (err) {
      apply(null)
      setLoadState(
        apiErrorBody(err).errorCode === SSO_FEATURE_DISABLED_CODE
          ? LoadState.UNAVAILABLE
          : LoadState.ERROR,
      )
    }
  }, [apply, name])

  // Re-read when the domain's policy changes elsewhere on the page.
  useEffect(() => {
    void load()
  }, [load, domain.authPolicy])

  const run = async (task: () => Promise<void>, failure: string) => {
    if (busy) return
    setBusy(true)
    try {
      await task()
    } catch (err) {
      toast.error(apiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const input = buildSsoInput(form)
      if (!input) return
      apply(await teamService.saveSsoConfig(name, input))
      setForm(EMPTY_SSO_FORM)
      setEditing(false)
      toast.success('Connection saved. Run a test sign-in, then enable SSO.')
    }, 'Failed to save the SSO connection')

  const test = () =>
    run(async () => {
      const { redirectUrl } = await teamService.startSsoTest(name)
      if (!isSafeIdpUrl(redirectUrl)) {
        toast.error('The identity provider address was not valid')
        return
      }
      window.location.assign(redirectUrl)
    }, 'Could not start the test sign-in')

  const toggle = (enabled: boolean) =>
    run(async () => {
      apply(await teamService.setSsoEnabled(name, enabled))
      toast.success(enabled ? 'SSO enabled' : 'SSO disabled')
    }, 'Failed to update SSO')

  const remove = () =>
    run(async () => {
      const { revokedSessions } = await teamService.deleteSsoConfig(name)
      setConfirmRemove(false)
      toast.success(
        `SSO connection removed. ${revokedSessions} ${revokedSessions === 1 ? 'session was' : 'sessions were'} signed out.`,
      )
      await load()
      onChanged()
    }, 'Failed to remove the SSO connection')

  if (loadState === LoadState.UNAVAILABLE) return null

  if (loadState === LoadState.LOADING && !config) {
    return <Skeleton className='h-24 w-full' />
  }

  if (loadState === LoadState.ERROR || !config) {
    return (
      <section className='rounded-lg border border-border p-3 text-sm'>
        <span className='font-medium'>{name}</span>
        <p className='mt-1 text-muted-foreground'>
          Could not load the SSO setup.
        </p>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='mt-2'
          onClick={() => void load()}
        >
          Try again
        </Button>
      </section>
    )
  }

  const status = ssoStatus(config)
  const required = config.authPolicy === DomainAuthPolicy.SAML_SSO
  const expiry = certificateExpiryState(config.certificateExpiresAt)
  const preset =
    SSO_PROVIDER_PRESETS.find((p) => p.id === presetId) ??
    SSO_PROVIDER_PRESETS[0]
  const showForm = !config.configured || editing
  const canSave = buildSsoInput(form) !== null && !busy

  return (
    <section
      aria-label={`Single sign-on for ${name}`}
      className='space-y-4 rounded-lg border border-border p-4'
    >
      <header className='flex flex-wrap items-center gap-2'>
        <h3 className='text-sm font-semibold'>{name}</h3>
        <Badge variant={STATUS_VARIANT[status]}>
          {SSO_STATUS_LABELS[status]}
        </Badge>
      </header>

      <div className='space-y-3'>
        <p className='text-sm font-medium'>
          1. Add this app to your identity provider
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <CopyValue label='ACS URL' value={config.acsUrl} />
          <CopyValue label='Entity ID' value={config.spEntityId} />
        </div>
        <div>
          <label
            htmlFor={`sso-provider-${name}`}
            className='mb-1 block text-xs font-medium text-muted-foreground'
          >
            Setup guide for
          </label>
          <select
            id={`sso-provider-${name}`}
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className='h-8 rounded-md border border-input bg-transparent px-2 text-sm'
          >
            {SSO_PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ol className='mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground'>
            {preset.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>
              Your provider must sign the SAML assertion and send the user’s
              email address.
            </li>
          </ol>
        </div>
      </div>

      <div className='space-y-3'>
        <p className='text-sm font-medium'>
          2. Give us your provider’s settings
        </p>
        {config.configured && !editing && (
          <dl className='grid gap-2 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>Entity ID</dt>
              <dd className='break-all'>{config.idpEntityId}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Sign-in URL</dt>
              <dd className='break-all'>{config.idpSsoUrl}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Certificate expires</dt>
              <dd className='flex items-center gap-2'>
                {config.certificateExpiresAt
                  ? formatDate(config.certificateExpiresAt)
                  : '—'}
                {expiry === CertificateExpiryState.SOON && (
                  <Badge variant='secondary'>Expires soon: rotate it</Badge>
                )}
                {expiry === CertificateExpiryState.EXPIRED && (
                  <Badge>Expired</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Last SSO sign-in</dt>
              <dd>{formatDate(config.lastLoginAt) || '—'}</dd>
            </div>
          </dl>
        )}

        {showForm && (
          <>
            <SsoSetupForm
              idPrefix={`sso-${name}`}
              value={form}
              disabled={busy || required}
              onChange={setForm}
            />
            <div className='flex gap-2'>
              <Button
                type='button'
                size='sm'
                disabled={!canSave || required}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : 'Save connection'}
              </Button>
              {editing && (
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    setEditing(false)
                    setForm(EMPTY_SSO_FORM)
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}

        {config.configured && !editing && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || required}
            onClick={() => setEditing(true)}
          >
            Update connection
          </Button>
        )}
      </div>

      {config.configured && (
        <div className='space-y-3'>
          <p className='text-sm font-medium'>3. Test, then turn it on</p>
          <p className='text-xs text-muted-foreground'>
            {config.testedAt
              ? `Last passing test: ${formatDate(config.testedAt)}.`
              : 'Not tested yet. Changing the connection clears the test.'}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => void test()}
            >
              Test SSO connection
            </Button>
            {config.enabled ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={busy || required}
                onClick={() => void toggle(false)}
              >
                Disable SSO
              </Button>
            ) : (
              <Button
                type='button'
                size='sm'
                disabled={busy || !canEnable || config.testedAt === null}
                onClick={() => void toggle(true)}
              >
                Enable SSO
              </Button>
            )}
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={busy || required}
              onClick={() => setConfirmRemove(true)}
            >
              Remove connection
            </Button>
          </div>
          {!canEnable && !config.enabled && (
            <p className='text-xs text-muted-foreground'>
              Only the workspace owner can switch SSO on, after checking these
              settings.
            </p>
          )}
          {required && (
            <p className='text-xs text-muted-foreground'>
              Everyone on this domain must sign in with SSO, so the connection
              is locked. The owner can change the sign-in method in Sign-in
              security first.
            </p>
          )}
        </div>
      )}

      {confirmRemove && (
        <Modal
          isOpen
          onClose={() => setConfirmRemove(false)}
          title={`Remove the SSO connection for ${name}?`}
          description='People signed in through SSO are signed out, and SSO sign-in stops working until you set it up again.'
        >
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Removing…' : 'Remove connection'}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
