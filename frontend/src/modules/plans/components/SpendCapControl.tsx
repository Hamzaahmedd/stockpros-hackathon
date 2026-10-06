import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useEffect, useState } from 'react'
import {
  USER_SPEND_CAP_MAX_PAISA,
  USER_SPEND_CAP_MIN_PAISA,
} from '../constants'
import { usageService } from '../services'
import type { UsageSummary } from '../types'
import { formatPaisa, parseRupeesToPaisa } from '../utils'

interface SpendCapControlProps {
  readonly usage: UsageSummary
  /** Called with the refreshed summary after the limit changes. */
  readonly onChanged: (usage: UsageSummary) => void
}

const toRupeeString = (paisa: number | undefined): string =>
  paisa === undefined ? '' : String(paisa / 100)

/**
 * Lets an individual Pro user cap how much credit they spend per billing
 * cycle. Renders nothing for anyone else: workspace members are limited by
 * their admins, and FREE has no credits.
 */
export function SpendCapControl({ usage, onChanged }: SpendCapControlProps) {
  const cap = usage.spendCap
  const [input, setInput] = useState(toRupeeString(cap?.monthlyLimitPaisa))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInput(toRupeeString(cap?.monthlyLimitPaisa))
  }, [cap?.monthlyLimitPaisa])

  if (!usage.metered || !usage.credits?.canSetSpendCap) return null

  const submit = async (monthlyLimitPaisa: number | null) => {
    setSaving(true)
    setError(null)
    try {
      onChanged(await usageService.setSpendCap(monthlyLimitPaisa))
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update your spending limit"))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    const paisa = parseRupeesToPaisa(
      input,
      USER_SPEND_CAP_MIN_PAISA,
      USER_SPEND_CAP_MAX_PAISA,
    )
    if (paisa === null) {
      setError(
        `Enter an amount between ${formatPaisa(USER_SPEND_CAP_MIN_PAISA)} and ${formatPaisa(USER_SPEND_CAP_MAX_PAISA)}.`,
      )
      return
    }
    void submit(paisa)
  }

  const reached =
    cap !== null && cap.remainingPaisa < usage.credits.costPerSignalPaisa

  return (
    <section
      aria-label='Monthly spending limit'
      className='space-y-3 rounded-lg border border-border p-5'
    >
      <div>
        <h2 className='text-sm font-semibold'>Monthly spending limit</h2>
        <p className='text-xs text-muted-foreground'>
          Caps how much credit pay-as-you-go AI signals can use each billing
          cycle. Included signals are never affected.
        </p>
      </div>

      {cap && (
        <p className='text-sm' data-testid='spend-cap-status'>
          {formatPaisa(cap.spentPaisa)} of {formatPaisa(cap.monthlyLimitPaisa)}{' '}
          used this cycle ({formatPaisa(cap.remainingPaisa)} left).
        </p>
      )}
      {reached && (
        <p role='status' className='text-sm text-amber-600'>
          Limit reached: paid AI signals are paused until your next cycle or
          until you raise it.
        </p>
      )}

      <div className='flex flex-wrap items-end gap-3'>
        <label className='text-xs text-muted-foreground'>
          Limit per cycle (Rs)
          <Input
            type='number'
            inputMode='decimal'
            min={USER_SPEND_CAP_MIN_PAISA / 100}
            max={USER_SPEND_CAP_MAX_PAISA / 100}
            step={USER_SPEND_CAP_MIN_PAISA / 100}
            value={input}
            placeholder='No limit'
            onChange={(event) => setInput(event.target.value)}
            className='mt-1 w-40'
          />
        </label>
        <Button type='button' disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save limit'}
        </Button>
        {cap && (
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={() => void submit(null)}
          >
            Remove limit
          </Button>
        )}
      </div>

      {error && (
        <p role='alert' className='text-sm text-red-500'>
          {error}
        </p>
      )}
    </section>
  )
}
