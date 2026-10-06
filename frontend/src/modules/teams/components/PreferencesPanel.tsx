import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useTheme } from '@/shared/hooks/useTheme'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { teamService } from '../services'
import type {
  ChartLayout,
  PreferenceTheme,
  Preferences,
  PreferencesPatch,
  PreferencesView,
} from '../types'
import {
  CHART_LAYOUTS,
  PREFERENCE_THEMES,
  parseChartLayout,
  parseIndicators,
  parsePreferenceTheme,
  toAppTheme,
} from '../utils'

const label = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase()

interface PreferencesPanelProps {
  /** `personal` edits your own overrides; `workspace` edits the defaults everyone inherits (owner/admin). */
  mode: 'personal' | 'workspace'
  /** Whether the caller belongs to a workspace — decides how the "default" option is worded. */
  inWorkspace?: boolean
}

/**
 * Theme / chart layout / indicators. Personal values overlay the workspace
 * defaults; choosing the "default" option clears the override (sent as `null`).
 */
export function PreferencesPanel({
  mode,
  inWorkspace = false,
}: PreferencesPanelProps) {
  const { setTheme } = useTheme()
  const [view, setView] = useState<PreferencesView | null>(null)
  const [theme, setThemeValue] = useState<PreferenceTheme | ''>('')
  const [layout, setLayout] = useState<ChartLayout | ''>('')
  const [indicators, setIndicators] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hydrate = useCallback(
    (next: PreferencesView) => {
      const stored: Preferences =
        mode === 'personal' ? next.personal : next.workspace
      setView(next)
      setThemeValue(stored.theme ?? '')
      setLayout(stored.chartLayout ?? '')
      setIndicators((stored.indicators ?? []).join(', '))
    },
    [mode],
  )

  useEffect(() => {
    let cancelled = false
    teamService
      .getPreferences()
      .then((result) => !cancelled && hydrate(result))
      .catch(
        (err) =>
          !cancelled &&
          setError(apiErrorMessage(err, "Couldn't load preferences")),
      )
    return () => {
      cancelled = true
    }
  }, [hydrate])

  if (error) return <p className='text-sm text-red-500'>{error}</p>
  if (!view) return <Skeleton className='h-40 w-full' />

  const inherited = mode === 'personal' ? view.workspace : {}
  const defaultLabel =
    mode === 'workspace'
      ? 'Not set'
      : inWorkspace
        ? 'Workspace default'
        : 'Default'
  const hint = (value: string | undefined) =>
    mode === 'personal' && value ? ` (${label(value)})` : ''

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    const list = parseIndicators(indicators)
    if (list === null) {
      toast.error('Indicators: up to 20 names, each 1–40 characters')
      return
    }
    const patch: PreferencesPatch = {
      theme: theme || null,
      chartLayout: layout || null,
      indicators: list.length > 0 ? list : null,
    }

    setSaving(true)
    try {
      const next =
        mode === 'personal'
          ? await teamService.updateMyPreferences(patch)
          : await teamService.updateWorkspacePreferences(patch)
      hydrate(next)
      // A personal theme choice applies (and sticks) immediately.
      if (mode === 'personal' && next.personal.theme) {
        setTheme(toAppTheme(next.personal.theme))
      }
      toast.success(
        mode === 'personal' ? 'Preferences saved' : 'Workspace defaults saved',
      )
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save preferences'))
    } finally {
      setSaving(false)
    }
  }

  const selectClass =
    'mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm'

  return (
    <form
      onSubmit={handleSave}
      className='space-y-4'
      aria-label={`${mode} preferences`}
    >
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <label htmlFor={`${mode}-theme`} className='text-sm font-medium'>
            Theme
          </label>
          <select
            id={`${mode}-theme`}
            value={theme}
            onChange={(e) =>
              setThemeValue(parsePreferenceTheme(e.target.value))
            }
            className={selectClass}
          >
            <option value=''>
              {defaultLabel}
              {hint(inherited.theme)}
            </option>
            {PREFERENCE_THEMES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${mode}-layout`} className='text-sm font-medium'>
            Chart layout
          </label>
          <select
            id={`${mode}-layout`}
            value={layout}
            onChange={(e) => setLayout(parseChartLayout(e.target.value))}
            className={selectClass}
          >
            <option value=''>
              {defaultLabel}
              {hint(inherited.chartLayout)}
            </option>
            {CHART_LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {label(l)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${mode}-indicators`} className='text-sm font-medium'>
          Indicators
        </label>
        <Input
          id={`${mode}-indicators`}
          value={indicators}
          onChange={(e) => setIndicators(e.target.value)}
          placeholder='e.g. RSI, MACD, SMA50'
          className='mt-1'
        />
        <p className='mt-1 text-xs text-muted-foreground'>
          Comma-separated.
          {mode === 'personal' && (inherited.indicators?.length ?? 0) > 0 && (
            <> Workspace default: {inherited.indicators?.join(', ')}.</>
          )}{' '}
          Leave blank to use{' '}
          {mode === 'workspace' ? 'no default' : 'the default'}.
        </p>
      </div>

      <p className='text-xs text-muted-foreground'>
        Theme applies immediately. Chart layout and indicators are saved to your
        profile for charts that support them.
      </p>

      <Button type='submit' disabled={saving}>
        {saving
          ? 'Saving…'
          : mode === 'personal'
            ? 'Save preferences'
            : 'Save workspace defaults'}
      </Button>
    </form>
  )
}
