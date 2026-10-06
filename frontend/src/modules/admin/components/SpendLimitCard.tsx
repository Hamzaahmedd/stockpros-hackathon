import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import {
  BLOCKED_REASON_LABELS,
  USER_SPEND_CAP_MAX_PAISA,
  USER_SPEND_CAP_MIN_PAISA,
} from '../constants'
import { adminService } from '../services'
import type { AdminUser, AdminUserUsage } from '../types'
import {
  apiErrorMessage,
  formatDateTime,
  formatPaisa,
  parseRupeesToPaisa,
} from '../utils'
import { ReasonModal } from './ReasonModal'

interface Props {
  user: AdminUser
  /** PLATFORM_ADMIN+: may change the customer's limit. The API enforces this too. */
  canOverride: boolean
  onClose: () => void
  /** Called after the limit changed, so the user list can refresh. */
  onChanged: () => void
}

/** Why staff cannot set this customer's own limit, or null when they can. */
const overrideBlocker = (user: AdminUser): string | null => {
  if (user.plan === 'FREE') return 'Free plans have no credits to limit.'
  if (user.team) {
    return 'This customer is in a workspace: their limit is set by a workspace admin.'
  }
  return null
}

const Row = ({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) => (
  <div>
    <dt className='text-xs text-muted-foreground'>{label}</dt>
    <dd className='text-sm font-medium'>{children}</dd>
  </div>
)

/**
 * A customer's spending position for support: allowance, spending limit, this
 * cycle's spend, credits and, when usage is currently refused, why. Platform
 * admins can change the customer's own limit (audited, ticket required).
 */
export function SpendLimitCard({
  user,
  canOverride,
  onClose,
  onChanged,
}: Readonly<Props>) {
  const [usage, setUsage] = useState<AdminUserUsage | null>(null)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [noLimit, setNoLimit] = useState(false)

  const load = useCallback(async () => {
    try {
      setUsage(await adminService.getUserUsage(user.id))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load usage'))
    }
  }, [user.id])

  useEffect(() => {
    void load()
  }, [load])

  const blocker = overrideBlocker(user)
  const limitPaisa = noLimit
    ? null
    : parseRupeesToPaisa(
        input,
        USER_SPEND_CAP_MIN_PAISA,
        USER_SPEND_CAP_MAX_PAISA,
      )
  const validLimit = noLimit || limitPaisa !== null

  const openEditor = () => {
    const current = usage?.spendCap?.monthlyLimitPaisa
    setInput(current === undefined ? '' : String(current / 100))
    setNoLimit(false)
    setEditing(true)
  }

  return (
    <Card aria-label='Spend limit'>
      <CardHeader className='flex-row items-center justify-between space-y-0'>
        <CardTitle className='text-base'>
          Spend limit · {user.displayName ?? user.email}
        </CardTitle>
        <Button size='sm' variant='ghost' onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {usage === null ? (
          <Skeleton className='h-16 w-full' />
        ) : (
          <>
            {usage.blockedReason && (
              <Badge variant='destructive'>
                Usage blocked: {BLOCKED_REASON_LABELS[usage.blockedReason]}
              </Badge>
            )}
            {usage.metered ? (
              <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                <Row label='Included signals'>
                  {usage.quota?.used} / {usage.quota?.limit}
                </Row>
                <Row label='Resets'>
                  {formatDateTime(usage.quota?.windowEnd ?? null)}
                </Row>
                <Row label='Credit balance'>
                  {formatPaisa(usage.credits?.balanceInPaisa ?? 0)}
                </Row>
                <Row label='Spend limit'>
                  {usage.spendCap
                    ? formatPaisa(usage.spendCap.monthlyLimitPaisa)
                    : 'No limit'}
                </Row>
                <Row label='Spent this cycle'>
                  {usage.spendCap
                    ? formatPaisa(usage.spendCap.spentPaisa)
                    : '—'}
                </Row>
                <Row label='Usage emails'>
                  {usage.alertsEnabled ? 'On' : 'Off'}
                </Row>
              </dl>
            ) : (
              <p className='text-sm text-muted-foreground'>
                Free plan: daily per-feature quotas apply, with no monthly meter
                or credits.
              </p>
            )}
          </>
        )}

        {canOverride &&
          (blocker ? (
            <p className='text-xs text-muted-foreground'>{blocker}</p>
          ) : (
            <Button
              size='sm'
              variant='outline'
              disabled={usage === null}
              onClick={openEditor}
            >
              Change limit
            </Button>
          ))}
      </CardContent>

      {editing && (
        <ReasonModal
          title='Change spending limit'
          description={`Sets the monthly credit limit ${user.email} placed on themselves. Audited with the previous and new value, and the customer is emailed the change and the ticket.`}
          confirmLabel='Save limit'
          successMessage='Spending limit updated'
          canSubmit={validLimit}
          ticketRequired
          onSubmit={(reason, ticketRef) =>
            adminService.setSpendLimit(
              user.id,
              limitPaisa,
              reason,
              ticketRef ?? '',
            )
          }
          onClose={() => setEditing(false)}
          onDone={() => {
            void load()
            onChanged()
          }}
        >
          <div>
            <label
              htmlFor='admin-spend-limit'
              className='mb-1 block text-sm font-medium'
            >
              Monthly limit (Rs)
            </label>
            <Input
              id='admin-spend-limit'
              inputMode='decimal'
              value={input}
              disabled={noLimit}
              aria-invalid={!validLimit}
              onChange={(event) => setInput(event.target.value)}
            />
            <p className='mt-1 text-xs text-muted-foreground'>
              Between {formatPaisa(USER_SPEND_CAP_MIN_PAISA)} and{' '}
              {formatPaisa(USER_SPEND_CAP_MAX_PAISA)}.
            </p>
            <label className='mt-2 flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={noLimit}
                onChange={(event) => setNoLimit(event.target.checked)}
              />
              Remove the limit
            </label>
          </div>
        </ReasonModal>
      )}
    </Card>
  )
}
