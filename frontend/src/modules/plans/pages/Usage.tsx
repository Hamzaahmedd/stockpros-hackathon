import { Sidebar } from '@/shared/components/Sidebar'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditLedgerPanel } from '../components/CreditLedgerPanel'
import { QuotaMeter } from '../components/QuotaMeter'
import { SpendCapControl } from '../components/SpendCapControl'
import { UsageHistoryChart } from '../components/UsageHistoryChart'
import { METERED_FEATURE_LABELS } from '../constants'
import { usageService } from '../services'
import type { UsageHistory, UsageHistoryRange, UsageSummary } from '../types'
import { daysUntil, formatChartDay, formatPaisa } from '../utils'

const RANGE_OPTIONS: { id: UsageHistoryRange; label: string }[] = [
  { id: 'current', label: 'This cycle' },
  { id: 'previous', label: 'Previous cycle' },
]

const cycleLabel = (history: UsageHistory): string => {
  const first = history.daily[0]?.date
  const last = history.daily.at(-1)?.date
  return first && last
    ? `${formatChartDay(first)} – ${formatChartDay(last)}`
    : ''
}

function resetNote(history: UsageHistory): string | null {
  const end = history.window?.end
  if (history.range !== 'current' || !end) return null
  if (new Date(end) < new Date()) return 'Billing period ended — renew to reset'
  const days = daysUntil(end)
  return `Resets ${formatChartDay(end.slice(0, 10))} · ${days} day${days === 1 ? '' : 's'} left`
}

/** Usage detail: allowance and reset date, signals per day, split by feature, and the credit ledger. */
export default function Usage() {
  const [range, setRange] = useState<UsageHistoryRange>('current')
  const [history, setHistory] = useState<UsageHistory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  // Bumped after the spending limit changes so the meter above reloads too.
  const [meterKey, setMeterKey] = useState(0)

  const load = useCallback(async (nextRange: UsageHistoryRange) => {
    setError(null)
    setHistory(null)
    try {
      setHistory(await usageService.getHistory(nextRange))
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your usage history"))
    }
  }, [])

  useEffect(() => {
    void load(range)
  }, [range, load])

  useEffect(() => {
    usageService
      .getMyUsage()
      .then(setSummary)
      // The limit control is optional; the meter reports its own load failure.
      .catch(() => setSummary(null))
  }, [])

  const handleCapChanged = (next: UsageSummary) => {
    setSummary(next)
    setMeterKey((key) => key + 1)
  }

  const isTeamView = history?.scope === 'TEAM'
  const note = history ? resetNote(history) : null
  const featureMax = Math.max(
    ...(history?.byFeature.map((feature) => feature.signals) ?? [0]),
    1,
  )

  return (
    <div className='flex h-screen overflow-hidden bg-background text-foreground'>
      <Sidebar />
      <main id='main-content' className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-[900px] space-y-6 p-4 lg:p-8'>
          <header>
            <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
              Usage
            </h1>
            <p className='mt-2 text-muted-foreground'>
              AI signals and credits, day by day.
            </p>
          </header>

          <QuotaMeter key={meterKey} showDetailsLink={false} />

          {summary && (
            <SpendCapControl usage={summary} onChanged={handleCapChanged} />
          )}

          {error && (
            <div role='alert' className='flex items-center gap-3 text-sm'>
              <span className='text-red-500'>{error}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => load(range)}
              >
                Try again
              </Button>
            </div>
          )}

          {!error && !history && <Skeleton className='h-80 w-full' />}

          {history && !history.metered && (
            <p className='rounded-lg border border-border p-5 text-sm text-muted-foreground'>
              The Free plan has daily limits instead of a monthly allowance, so
              there&apos;s no usage history to show.{' '}
              <Link to='/plans' className='font-medium text-primary underline'>
                See plans
              </Link>
            </p>
          )}

          {history?.metered && (
            <>
              <Card>
                <CardHeader>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <CardTitle className='text-lg'>
                        AI signals per day
                      </CardTitle>
                      <CardDescription>
                        {isTeamView
                          ? 'Everyone in your workspace'
                          : 'Your own usage'}
                        {' · '}
                        {cycleLabel(history)}
                      </CardDescription>
                    </div>
                    <div
                      role='group'
                      aria-label='Billing cycle'
                      className='flex gap-1 rounded-lg border border-border p-1'
                    >
                      {RANGE_OPTIONS.map((option) => (
                        <Button
                          key={option.id}
                          type='button'
                          size='sm'
                          variant={range === option.id ? 'default' : 'ghost'}
                          aria-pressed={range === option.id}
                          onClick={() => setRange(option.id)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-6'>
                  <dl className='flex flex-wrap gap-x-10 gap-y-3'>
                    <div>
                      <dt className='text-xs text-muted-foreground'>Signals</dt>
                      <dd
                        className='text-2xl font-bold tabular-nums'
                        data-testid='history-signals'
                      >
                        {history.totals.signals}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-xs text-muted-foreground'>
                        Paid from credits
                      </dt>
                      <dd
                        className='text-2xl font-bold tabular-nums'
                        data-testid='history-credit-spend'
                      >
                        {formatPaisa(history.totals.creditSpentPaisa)}
                      </dd>
                    </div>
                  </dl>
                  {note && (
                    <p
                      className='text-sm text-muted-foreground'
                      data-testid='history-reset'
                    >
                      {note}
                    </p>
                  )}

                  <UsageHistoryChart days={history.daily} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-lg'>By feature</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className='space-y-4'>
                    {history.byFeature.map((item) => (
                      <li key={item.feature}>
                        <div className='flex items-baseline justify-between gap-3 text-sm'>
                          <span className='font-medium'>
                            {METERED_FEATURE_LABELS[item.feature]}
                          </span>
                          <span className='tabular-nums text-muted-foreground'>
                            {item.signals} signal{item.signals === 1 ? '' : 's'}
                            {item.creditSpentPaisa > 0 &&
                              ` · ${formatPaisa(item.creditSpentPaisa)} credits`}
                          </span>
                        </div>
                        <div
                          className='mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted'
                          aria-hidden='true'
                        >
                          <div
                            className='h-full rounded-full bg-primary'
                            style={{
                              width: `${(item.signals / featureMax) * 100}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-lg'>Credit history</CardTitle>
                  <CardDescription>
                    Top-ups and pay-as-you-go usage.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CreditLedgerPanel scope={isTeamView ? 'TEAM' : 'USER'} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
