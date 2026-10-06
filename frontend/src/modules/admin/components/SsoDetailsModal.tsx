import { DomainAuthPolicy } from '@/modules/auth/types'
import { Modal } from '@/shared/components/Modal'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useEffect, useState } from 'react'
import { adminService } from '../services'
import type { AdminTeamSso } from '../types'
import { actionLabel, apiErrorMessage, formatDateTime } from '../utils'

interface SsoDetailsModalProps {
  domain: string
  /** PLATFORM_ADMIN+: may disable or reset. */
  canWrite: boolean
  onDisable: () => void
  onReset: () => void
  onClose: () => void
}

/** A customer's SSO as staff need it for support: setup, live sessions and the recent trail. Never shows the certificate. */
export function SsoDetailsModal({
  domain,
  canWrite,
  onDisable,
  onReset,
  onClose,
}: Readonly<SsoDetailsModalProps>) {
  const [sso, setSso] = useState<AdminTeamSso | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    adminService
      .getTeamSso(domain)
      .then((result) => {
        if (!stale) setSso(result)
      })
      .catch((err) => {
        if (!stale) setError(apiErrorMessage(err, 'Could not load SSO details'))
      })
    return () => {
      stale = true
    }
  }, [domain])

  const required = sso?.authPolicy === DomainAuthPolicy.SAML_SSO

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`SSO for ${domain}`}
      description='Read-only diagnosis. Disabling or resetting needs a reason and is audited.'
      widthClass='max-w-2xl'
    >
      <div className='space-y-4 text-sm'>
        {!sso && !error && <Skeleton className='h-32 w-full' />}
        {error && <p role='alert'>{error}</p>}

        {sso && (
          <>
            <div className='flex flex-wrap gap-2'>
              <Badge variant={sso.configured ? 'default' : 'secondary'}>
                {sso.configured ? 'Configured' : 'Not configured'}
              </Badge>
              <Badge variant={sso.enabled ? 'default' : 'secondary'}>
                {sso.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={sso.testedAt ? 'default' : 'secondary'}>
                {sso.testedAt ? 'Tested' : 'Not tested'}
              </Badge>
              {required && <Badge>Required for everyone</Badge>}
            </div>

            <dl className='grid gap-2 sm:grid-cols-2'>
              <div>
                <dt className='text-muted-foreground'>Sign-in policy</dt>
                <dd>{sso.authPolicy}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Live SSO sessions</dt>
                <dd>{sso.activeSsoSessions}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>IdP Entity ID</dt>
                <dd className='break-all'>{sso.idpEntityId ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>IdP sign-in URL</dt>
                <dd className='break-all'>{sso.idpSsoUrl ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Certificate expires</dt>
                <dd>{formatDateTime(sso.certificateExpiresAt)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Last passing test</dt>
                <dd>{formatDateTime(sso.testedAt)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Last SSO sign-in</dt>
                <dd>{formatDateTime(sso.lastLoginAt)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Last changed by</dt>
                <dd className='break-all font-mono text-xs'>
                  {sso.updatedByUserId ?? '—'}
                </dd>
              </div>
            </dl>

            <div>
              <h4 className='mb-1 font-medium'>Recent SSO activity</h4>
              {sso.recentActivity.length === 0 ? (
                <p className='text-muted-foreground'>Nothing recorded yet.</p>
              ) : (
                <ul className='space-y-1'>
                  {sso.recentActivity.map((entry) => (
                    <li
                      key={entry.id}
                      className='flex flex-wrap items-center gap-2'
                    >
                      <Badge variant='secondary'>
                        {actionLabel(entry.action)}
                      </Badge>
                      <span>{formatDateTime(entry.createdAt)}</span>
                      {entry.metadata?.byStaff === true && (
                        <Badge>By staff</Badge>
                      )}
                      <span className='font-mono text-[10px] text-muted-foreground'>
                        {entry.actorUserId ?? 'system'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canWrite && (
              <div className='flex flex-wrap justify-end gap-2 border-t border-border pt-3'>
                {(sso.enabled || required) && (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={onDisable}
                  >
                    Disable SSO
                  </Button>
                )}
                {sso.configured && (
                  <Button
                    type='button'
                    size='sm'
                    variant='destructive'
                    onClick={onReset}
                  >
                    Reset SSO setup
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        <div className='flex justify-end'>
          <Button type='button' variant='ghost' onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
