import { Switch } from '@/shared/components/ui/switch'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useState } from 'react'
import { usageService } from '../services'
import type { UsageSummary } from '../types'

interface UsageAlertsToggleProps {
  readonly usage: UsageSummary
  /** Called with the refreshed summary after the preference changes. */
  readonly onChanged: (usage: UsageSummary) => void
}

/**
 * Turns the usage-warning emails on or off: 80% and 100% of the included
 * signals, a low credit balance, and 90% of the personal spending limit.
 * Shown to individual Pro users only; workspace members are not emailed yet.
 */
export function UsageAlertsToggle({
  usage,
  onChanged,
}: UsageAlertsToggleProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!usage.metered || !usage.credits?.canSetSpendCap) return null

  const handleChange = async (enabled: boolean) => {
    setSaving(true)
    setError(null)
    try {
      onChanged(await usageService.setAlertsEnabled(enabled))
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update your email alerts"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label='Usage email alerts'
      className='space-y-2 rounded-lg border border-border p-5'
    >
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 id='usage-alerts-label' className='text-sm font-semibold'>
            Email me before I hit a limit
          </h2>
          <p className='text-xs text-muted-foreground'>
            One email per cycle at 80% and 100% of your included signals, when
            your credit balance is low, and at 90% of your spending limit.
          </p>
        </div>
        <Switch
          aria-labelledby='usage-alerts-label'
          checked={usage.alertsEnabled}
          disabled={saving}
          onCheckedChange={handleChange}
        />
      </div>
      {error && (
        <p role='alert' className='text-sm text-red-500'>
          {error}
        </p>
      )}
    </section>
  )
}
