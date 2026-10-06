import { useAuth } from '@/modules/auth/hooks/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usageService } from '../services'
import type { UsageSummary } from '../types'
import { formatPaisa } from '../utils'
import { TopUpModal } from './TopUpModal'

const WARN_AT = 0.8

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

type Tone = 'ok' | 'warn' | 'over'

const toneFor = (used: number, limit: number): Tone => {
  if (used >= limit) return 'over'
  return used / limit >= WARN_AT ? 'warn' : 'ok'
}

const BAR_COLOR: Record<Tone, string> = {
  ok: 'bg-primary',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
}

/**
 * "212 of 300 AI signals used" for the current cycle, the credits that pay for
 * anything beyond it, and a Top up button. Renders nothing for FREE users
 * (daily quotas apply) or while tiers aren't enforced, since there is nothing
 * meaningful to meter in either case.
 */
interface QuotaMeterProps {
  /** Hide the "Usage details" link, e.g. on the usage page itself. */
  readonly showDetailsLink?: boolean
}

function UsageDetailsLink({ visible }: Readonly<{ visible: boolean }>) {
  if (!visible) return null
  return (
    <Link
      to='/usage'
      className='inline-block text-sm font-medium text-primary underline'
    >
      Usage details
    </Link>
  )
}

export function QuotaMeter({
  showDetailsLink = true,
}: Readonly<QuotaMeterProps>) {
  const { pricingTiersEnabled, enablePaymentProcessor } = useAuth()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [topUpOpen, setTopUpOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setUsage(await usageService.getMyUsage())
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your usage"))
    }
  }, [])

  useEffect(() => {
    if (pricingTiersEnabled) void load()
  }, [pricingTiersEnabled, load])

  if (!pricingTiersEnabled) return null

  if (error) {
    return (
      <div role='alert' className='flex items-center gap-3 text-sm'>
        <span className='text-red-500'>{error}</span>
        <Button type='button' variant='outline' size='sm' onClick={load}>
          Try again
        </Button>
      </div>
    )
  }
  if (!usage) return <Skeleton className='h-28 w-full' />
  if (!usage.metered || !usage.quota || !usage.credits) return null

  const { quota, credits, spendCap } = usage
  const tone = toneFor(quota.used, quota.limit)
  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100))
  const outOfSignals = quota.remaining === 0 && credits.signalsAvailable === 0
  const resetOver =
    quota.windowEnd !== null && new Date(quota.windowEnd) < new Date()
  const poolLabel =
    credits.pool === 'TEAM' ? 'Workspace credits' : 'Your credits'

  return (
    <section
      aria-label='AI signal usage'
      className='space-y-4 rounded-lg border border-border p-5'
    >
      <div>
        <div className='flex items-baseline justify-between gap-3'>
          <p className='text-sm font-semibold'>
            <span data-testid='quota-used'>{quota.used}</span> of{' '}
            <span data-testid='quota-limit'>{quota.limit}</span> AI signals used
          </p>
          <p className='text-xs text-muted-foreground'>
            {quota.windowEnd === null
              ? ''
              : resetOver
                ? 'Billing period ended — renew to reset'
                : `Resets ${formatDay(quota.windowEnd)}`}
          </p>
        </div>
        <div
          role='progressbar'
          aria-label='AI signals used this cycle'
          aria-valuemin={0}
          aria-valuemax={quota.limit}
          aria-valuenow={Math.min(quota.used, quota.limit)}
          className='mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted'
        >
          <div
            className={`h-full ${BAR_COLOR[tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className='mt-2 text-xs text-muted-foreground'>
          {quota.remaining > 0
            ? `${quota.remaining} included signal${quota.remaining === 1 ? '' : 's'} left this cycle.`
            : `Included signals used — each extra one costs ${formatPaisa(credits.costPerSignalPaisa)} from credits.`}
        </p>
      </div>

      {outOfSignals && (
        <p
          role='alert'
          className='rounded-md bg-red-500/10 p-3 text-sm text-red-500'
        >
          You&apos;re out of AI signals.{' '}
          {credits.canTopUp
            ? 'Top up credits to keep using forecasts and market decisions.'
            : 'Ask a workspace admin to top up the shared credits.'}
        </p>
      )}

      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4'>
        <div>
          <p className='text-xs text-muted-foreground'>{poolLabel}</p>
          <p className='text-lg font-bold' data-testid='credit-balance'>
            {formatPaisa(credits.balanceInPaisa)}
          </p>
          <p className='text-xs text-muted-foreground'>
            ≈ {credits.signalsAvailable} extra signal
            {credits.signalsAvailable === 1 ? '' : 's'}
          </p>
        </div>

        {credits.canTopUp ? (
          <Button
            type='button'
            variant={outOfSignals || tone !== 'ok' ? 'default' : 'outline'}
            onClick={() => setTopUpOpen(true)}
            disabled={!enablePaymentProcessor}
            title={
              enablePaymentProcessor
                ? undefined
                : 'Online payments are turned off'
            }
          >
            Top up credits
          </Button>
        ) : (
          <p className='max-w-[16rem] text-right text-xs text-muted-foreground'>
            Only a workspace owner or admin can top up the shared credits.
          </p>
        )}
      </div>

      {credits.canTopUp && !enablePaymentProcessor && (
        <p className='text-xs text-muted-foreground'>
          Top-ups need online payments, which aren&apos;t enabled here.
        </p>
      )}

      <UsageDetailsLink visible={showDetailsLink} />

      {spendCap && (
        <p className='text-xs text-muted-foreground' data-testid='spend-cap'>
          Your monthly credit limit: {formatPaisa(spendCap.spentPaisa)} used of{' '}
          {formatPaisa(spendCap.monthlyLimitPaisa)} (
          {formatPaisa(spendCap.remainingPaisa)} left).
        </p>
      )}

      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        reason={
          credits.pool === 'TEAM'
            ? 'Credits are added to the shared workspace pool.'
            : undefined
        }
      />
    </section>
  )
}
