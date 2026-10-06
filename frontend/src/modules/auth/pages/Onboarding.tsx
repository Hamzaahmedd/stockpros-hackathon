import { Skeleton } from '@/shared/components/ui/skeleton'
import { setAccessToken } from '@/shared/utils/token'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Check, Info, Plus, Search } from 'lucide-react'
import posthog from 'posthog-js'
import React, { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import api from '../../../shared/api/axios'
import { notificationService } from '../../notifications/services'
import type {
  MarketInterest,
  NotificationPreferences,
} from '../../notifications/types'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useAuth } from '../hooks/useAuth'
import {
  ALERT_CHANNEL_OPTIONS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  MARKET_TOPICS,
  SUGGESTED_SYMBOLS,
} from '../constants'
import type {
  NotificationPreferenceToggle,
  OnboardingFormValues,
  SuggestedSymbol,
} from '../types'
import { onboardingSchema } from '../validation'

type OnboardingStep = 1 | 2 | 3

// Mirrors the backend's requireWatchlistLimitForFree cap (10 symbols/user on
// the Free plan) — shown as an inline warning here rather than blocking, since
// the account is always FREE at this point and the limit is informational
// until pricing tiers are enabled.
const FREE_WATCHLIST_LIMIT = 10

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Starter watchlist state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([
    'NVDA',
    'AAPL',
    'MSFT',
  ])
  const [searchQuery, setSearchQuery] = useState('')
  const [customSymbols, setCustomSymbols] = useState<SuggestedSymbol[]>([])
  const [showWatchlistLimitWarning, setShowWatchlistLimitWarning] =
    useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  )

  const navigate = useNavigate()
  const { user, refreshMe } = useAuth()

  const storedGoogleName =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('onboarding_display_name')
      : null

  const { register, trigger, formState, getValues } =
    useForm<OnboardingFormValues>({
      resolver: zodResolver(onboardingSchema),
      defaultValues: {
        displayName: user?.displayName || storedGoogleName || '',
      },
    })

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        setShowWatchlistLimitWarning(false)
        return current.filter((item) => item !== symbol)
      }
      if (current.length >= FREE_WATCHLIST_LIMIT) {
        setShowWatchlistLimitWarning(true)
        return current
      }
      return [...current, symbol]
    })
  }

  const toggleMarketInterest = (interest: MarketInterest) => {
    setPreferences((current) => ({
      ...current,
      marketInterests: current.marketInterests.includes(interest)
        ? current.marketInterests.filter((item) => item !== interest)
        : [...current.marketInterests, interest],
    }))
  }

  const togglePreference = (key: NotificationPreferenceToggle) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }))
  }

  const handleAddCustomSymbol = () => {
    const clean = searchQuery.trim().toUpperCase()
    if (!clean) return

    if (!selectedSymbols.includes(clean)) {
      if (selectedSymbols.length >= FREE_WATCHLIST_LIMIT) {
        setShowWatchlistLimitWarning(true)
        return
      }
      setSelectedSymbols((prev) => [...prev, clean])
      const exists =
        SUGGESTED_SYMBOLS.some((s) => s.symbol === clean) ||
        customSymbols.some((s) => s.symbol === clean)
      if (!exists) {
        setCustomSymbols((prev) => [
          ...prev,
          {
            symbol: clean,
            name: 'Custom Ticker',
            sector: 'Watchlist',
            category: 'all',
            hasAiForecast: true,
          },
        ])
      }
    }
    setSearchQuery('')
  }

  // Pre-filter / tailor suggested tickers in Step 2 based on Step 1 chosen market interests
  const filteredSymbols = useMemo(() => {
    const allAvailable = [...SUGGESTED_SYMBOLS, ...customSymbols]
    const interests = preferences.marketInterests

    // Map market interest IDs to symbol categories
    const matchingCategories = new Set<string>()
    if (interests.includes('ai_tech')) matchingCategories.add('tech')
    if (interests.includes('growth')) matchingCategories.add('growth')
    if (interests.includes('consumer')) matchingCategories.add('consumer')
    if (
      interests.includes('finance') ||
      interests.includes('energy') ||
      interests.includes('healthcare')
    ) {
      matchingCategories.add('index')
    }

    if (matchingCategories.size === 0) {
      return allAvailable
    }

    const tailored = allAvailable.filter(
      (item) =>
        item.category === 'all' ||
        matchingCategories.has(item.category) ||
        selectedSymbols.includes(item.symbol),
    )

    return tailored.length > 0 ? tailored : allAvailable
  }, [customSymbols, preferences.marketInterests, selectedSymbols])

  const handleNextFromStep1 = async () => {
    const valid = await trigger('displayName')
    if (valid) {
      setError(null)
      setStep(2)
    }
  }

  const handleNextFromStep2 = () => {
    setError(null)
    setStep(3)
  }

  const executeLaunch = async (skipWatchlist = false) => {
    try {
      setLoading(true)
      setError(null)

      const onboardingToken = sessionStorage.getItem('onboarding_token')
      const displayNameValue =
        getValues('displayName')?.trim() ||
        user?.displayName ||
        storedGoogleName ||
        'Trader'

      if (storedGoogleName) {
        sessionStorage.removeItem('onboarding_display_name')
      }

      let requiresPhoneVerification = false

      // 1. Complete account onboarding if token is pending
      if (onboardingToken) {
        const response = await api.post('/api/v1/auth/onboarding', {
          displayName: displayNameValue,
          onboardingToken,
        })

        if (response.data?.accessToken) {
          setAccessToken(response.data.accessToken)
        }
        requiresPhoneVerification = Boolean(
          response.data?.requiresPhoneVerification,
        )

        sessionStorage.removeItem('onboarding_token')
      }

      // 2. Persist notification and market preferences for this account.
      await notificationService.updatePreferences(preferences)

      // 3. Seed starter watchlist in database
      const tickersToSeed = skipWatchlist ? [] : selectedSymbols
      if (tickersToSeed.length > 0) {
        await Promise.all(
          tickersToSeed.map((symbol) =>
            api.post('/api/v1/watchlist', { symbol }).catch(() => undefined),
          ),
        )
      }

      // 4. Update auth state and navigate onward — phone verification (when
      // required) takes priority over landing straight on the dashboard.
      const onboardedUser = await refreshMe()
      if (onboardedUser) posthog.identify(onboardedUser.userId)

      if (requiresPhoneVerification) {
        navigate('/auth/verify-phone', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err: any) {
      console.error('Onboarding error:', err)
      setError(
        err.response?.data?.message ||
          'Failed to complete setup. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='relative flex min-h-screen flex-col justify-between overflow-hidden bg-background text-foreground selection:bg-primary/30'>
      {/* Ambient Terminal Background Glows consistent with app */}
      <div className='pointer-events-none absolute left-1/2 top-0 h-[350px] w-[800px] -translate-x-1/2 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl' />
      <div className='pointer-events-none absolute -bottom-20 right-10 h-[400px] w-[400px] rounded-full bg-primary/5 blur-3xl' />
      <div className='pointer-events-none absolute left-10 top-40 h-[300px] w-[300px] rounded-full bg-primary/5 blur-3xl' />

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className='relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border/80 px-6 py-5'>
        <div className='flex items-center gap-3'>
          <img
            src='/stockpros-logo.png'
            alt='StockPros Logo'
            className='h-9 w-9 object-contain'
          />
          <span className='text-xl font-black tracking-tight text-foreground'>
            Stock<span className='text-primary'>Pros</span>
          </span>
        </div>

        {/* Phase Indicator Steps */}
        <div className='flex items-center gap-2'>
          {[
            { num: 1, label: 'Identity' },
            { num: 2, label: 'Watchlist' },
            { num: 3, label: 'Launch' },
          ].map((s, idx) => {
            const getBadgeClass = () => {
              if (step === s.num) {
                return 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(6,182,212,0.4)]'
              }
              if (step > s.num) {
                return 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
              }
              return 'bg-muted/40 border border-border text-muted-foreground'
            }

            const getLabelClass = () => {
              if (step === s.num) {
                return 'text-primary'
              }
              if (step > s.num) {
                return 'text-foreground'
              }
              return 'text-muted-foreground'
            }

            return (
              <React.Fragment key={s.num}>
                {idx > 0 && (
                  <div
                    className={`h-0.5 w-4 transition-colors sm:w-6 ${
                      step >= s.num ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
                <div className='flex items-center gap-1.5'>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${getBadgeClass()}`}
                  >
                    {step > s.num ? (
                      <Check className='h-3 w-3 stroke-[2.5]' />
                    ) : (
                      s.num
                    )}
                  </span>
                  <span
                    className={`hidden text-xs font-semibold sm:inline ${getLabelClass()}`}
                  >
                    {s.label}
                  </span>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </header>

      {/* ── Main Content Card ───────────────────────────────────────────────── */}
      <main className='relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-6'>
        <div className='rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:p-10'>
          {error && (
            <div className='mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-xs font-medium text-destructive'>
              {error}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: IDENTITY & INTERESTS                                        */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className='space-y-6'>
              {/* Header & Title */}
              <div className='mx-auto mb-6 max-w-xl text-center'>
                <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
                  Identity &amp; Interests
                </h1>
                <p className='mt-2 text-sm font-medium text-muted-foreground'>
                  Pick topics you care about to tailor your market feed
                </p>
              </div>

              {/* Display Name Input */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <label
                    htmlFor='displayName'
                    className='block text-xs font-bold uppercase tracking-wider text-muted-foreground'
                  >
                    Display Name <span className='text-primary'>*</span>
                  </label>
                </div>
                <Input
                  id='displayName'
                  type='text'
                  placeholder='e.g. Alex Morgan'
                  error={formState.errors.displayName?.message}
                  registration={register('displayName')}
                  autoComplete='name'
                  label=''
                  className='h-12 w-full rounded-xl border-input bg-muted/30 px-4 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
                />
              </div>

              {/* Market Sectors & Themes */}
              <div className='space-y-4 pt-2'>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <h2 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                      Market Sectors &amp; Themes
                    </h2>
                    <p className='mt-0.5 text-[11px] text-muted-foreground'>
                      Select interests to pre-filter your starter tickers in the
                      next step.
                    </p>
                  </div>
                  <span className='text-xs text-muted-foreground'>
                    Selected:{' '}
                    <strong className='font-mono text-primary'>
                      {preferences.marketInterests.length}
                    </strong>
                  </span>
                </div>

                <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3'>
                  {MARKET_TOPICS.map((topic) => {
                    const active = preferences.marketInterests.includes(
                      topic.id,
                    )
                    const Icon = topic.icon
                    return (
                      <button
                        key={topic.id}
                        type='button'
                        onClick={() => toggleMarketInterest(topic.id)}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition ${
                          active
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                            : 'border-border bg-card/60 text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                        }`}
                      >
                        <span className='flex min-w-0 items-center gap-2.5'>
                          <Icon className='h-4 w-4 shrink-0 text-primary' />
                          <span className='truncate text-xs font-semibold'>
                            {topic.name}
                          </span>
                        </span>
                        {active && (
                          <Check className='h-3.5 w-3.5 shrink-0 stroke-[2.5] text-primary' />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className='space-y-3 border-t border-border pt-6'>
                <Button
                  type='button'
                  onClick={handleNextFromStep1}
                  className='flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition-all hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500'
                >
                  <span>Continue to Starter Watchlist</span>
                  <ArrowRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: STARTER WATCHLIST (DEDICATED SCREEN)                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className='space-y-6'>
              {/* Header & Title */}
              <div className='mx-auto mb-4 max-w-xl text-center'>
                <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
                  Starter Watchlist
                </h1>
                <p className='mt-2 text-sm font-medium text-muted-foreground'>
                  Select tickers to generate immediate AI forecasts
                </p>
              </div>

              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-medium text-muted-foreground'>
                    Showing tailored tickers based on your interests
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    Selected:{' '}
                    <strong className='font-mono font-bold text-primary'>
                      {selectedSymbols.length}
                    </strong>
                  </span>
                </div>

                {/* Custom Symbol Search Bar */}
                <div className='flex items-center gap-2'>
                  <div className='relative flex-1'>
                    <Search className='absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                    <input
                      type='text'
                      placeholder='Search any ticker (e.g. AMD, PLTR, GOOGL)...'
                      value={searchQuery}
                      onChange={(e) =>
                        setSearchQuery(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCustomSymbol()
                        }
                      }}
                      className='h-11 w-full rounded-xl border border-input bg-muted/30 pl-10 pr-4 text-xs text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:text-sm'
                    />
                  </div>
                  <button
                    type='button'
                    onClick={handleAddCustomSymbol}
                    disabled={!searchQuery.trim()}
                    className='flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-secondary px-4 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-40'
                  >
                    <Plus className='h-3.5 w-3.5' />
                    <span>Add</span>
                  </button>
                </div>

                {/* Curated Ticker Cards Grid */}
                <div className='grid max-h-[300px] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3'>
                  {filteredSymbols.map((item) => {
                    const active = selectedSymbols.includes(item.symbol)
                    return (
                      <button
                        key={item.symbol}
                        type='button'
                        onClick={() => toggleSymbol(item.symbol)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all duration-200 ${
                          active
                            ? 'border-primary bg-primary/10 text-foreground shadow-[0_0_12px_rgba(6,182,212,0.15)] ring-1 ring-primary/30'
                            : 'border-border bg-card/60 text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                        }`}
                      >
                        <div className='min-w-0 pr-2'>
                          <div className='flex items-center gap-1.5'>
                            <span className='font-mono text-sm font-bold text-foreground'>
                              {item.symbol}
                            </span>
                          </div>
                          <p className='mt-0.5 truncate text-[10px] font-medium text-muted-foreground'>
                            {item.name}
                          </p>
                        </div>

                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all ${
                            active
                              ? 'bg-primary font-bold text-primary-foreground shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                              : 'border border-border text-muted-foreground hover:border-muted-foreground'
                          }`}
                        >
                          {active ? (
                            <Check className='h-3 w-3 stroke-[2.5]' />
                          ) : (
                            <Plus className='h-3 w-3' />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* AI Real-Time Forecast Banner */}
                <div className='flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3'>
                  <Info className='h-4 w-4 shrink-0 text-primary' />
                  <p className='text-xs leading-relaxed text-muted-foreground'>
                    AI predictions and technical signals will automatically
                    generate for your selected tickers.
                  </p>
                </div>

                {/* Free plan watchlist limit warning (inline, non-blocking) */}
                {showWatchlistLimitWarning && (
                  <div className='flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3'>
                    <Info className='h-4 w-4 shrink-0 text-amber-500' />
                    <p className='text-xs leading-relaxed text-amber-600 dark:text-amber-400'>
                      The Free plan supports up to {FREE_WATCHLIST_LIMIT}{' '}
                      watchlist symbols. Remove one to add another, or upgrade
                      to Pro later for unlimited tracking.
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2 Actions */}
              <div className='space-y-3 border-t border-border pt-6'>
                <div className='flex items-center gap-3'>
                  <button
                    type='button'
                    onClick={() => setStep(1)}
                    className='flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-4 text-xs font-semibold text-muted-foreground transition hover:border-border hover:text-foreground'
                  >
                    <ArrowLeft className='h-4 w-4' />
                    <span className='hidden sm:inline'>Back</span>
                  </button>
                  <Button
                    type='button'
                    onClick={handleNextFromStep2}
                    className='flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition-all hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500'
                  >
                    <span>Continue to Alert Preferences</span>
                    <ArrowRight className='h-4 w-4' />
                  </Button>
                </div>

                <button
                  type='button'
                  onClick={() => executeLaunch(true)}
                  disabled={loading}
                  className='w-full cursor-pointer py-1 text-center text-xs text-muted-foreground transition hover:text-foreground'
                >
                  Skip starter watchlist and go straight to dashboard
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 3: ALERT PREFERENCES & LAUNCH                                 */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className='space-y-6'>
              {/* Header & Title */}
              <div className='mx-auto mb-6 max-w-xl text-center'>
                <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
                  Alert Preferences &amp; Launch
                </h1>
                <p className='mt-2 text-sm font-medium text-muted-foreground'>
                  Configure real-time notifications
                </p>
              </div>

              {/* Alert Channels Selection */}
              <div className='space-y-4'>
                <div>
                  <h2 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                    Alert Channels
                  </h2>
                  <p className='mt-0.5 text-[11px] text-muted-foreground'>
                    How would you like to receive updates?
                  </p>
                </div>

                <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-3'>
                  {ALERT_CHANNEL_OPTIONS.map((option) => {
                    const key = option.key
                    const Icon = option.icon
                    const active = preferences[key]
                    return (
                      <button
                        key={key}
                        type='button'
                        onClick={() => togglePreference(key)}
                        className={`rounded-xl border p-4 text-left transition duration-200 ${
                          active
                            ? 'border-primary bg-primary/10 text-foreground shadow-[0_0_12px_rgba(6,182,212,0.15)] ring-1 ring-primary/30'
                            : 'border-border bg-card/60 text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                        }`}
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <Icon className='h-4 w-4 text-primary' />
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full transition-all ${
                              active
                                ? 'bg-primary font-bold text-primary-foreground shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                                : 'border border-border text-muted-foreground hover:border-muted-foreground'
                            }`}
                          >
                            {active && (
                              <Check className='h-3 w-3 stroke-[2.5]' />
                            )}
                          </span>
                        </div>
                        <p className='mt-3 text-xs font-bold text-foreground'>
                          {option.title}
                        </p>
                        <p className='mt-1 text-[11px] font-medium leading-relaxed text-muted-foreground'>
                          {option.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Step 3 Actions */}
              <div className='space-y-3 border-t border-border pt-6'>
                <div className='flex items-center gap-3'>
                  <button
                    type='button'
                    onClick={() => setStep(2)}
                    disabled={loading}
                    className='flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-4 text-xs font-semibold text-muted-foreground transition hover:border-border hover:text-foreground'
                  >
                    <ArrowLeft className='h-4 w-4' />
                    <span className='hidden sm:inline'>Back</span>
                  </button>
                  <Button
                    type='button'
                    onClick={() => executeLaunch(false)}
                    disabled={loading}
                    className='flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-sm font-bold text-white shadow-lg shadow-cyan-950/40 transition-all hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500'
                  >
                    {loading ? (
                      <div className='flex items-center gap-2'>
                        <Skeleton className='h-4 w-4 rounded-full bg-white/30' />
                        <span>Seeding Watchlist &amp; Launching...</span>
                      </div>
                    ) : (
                      <>
                        <span>
                          Launch Dashboard ({selectedSymbols.length} Tickers)
                        </span>
                        <ArrowRight className='h-4 w-4' />
                      </>
                    )}
                  </Button>
                </div>

                <button
                  type='button'
                  onClick={() => executeLaunch(true)}
                  disabled={loading}
                  className='w-full cursor-pointer py-1 text-center text-xs text-muted-foreground transition hover:text-foreground'
                >
                  Skip starter watchlist and go straight to dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className='relative z-10 mx-auto w-full max-w-5xl space-y-2 border-t border-border/80 px-6 py-4 text-[11px] font-medium text-muted-foreground'>
        <div className='flex items-center justify-between gap-3'>
          <span>
            &copy; {new Date().getFullYear()} StockPros. All rights reserved.
          </span>
        </div>
        <p className='leading-relaxed text-muted-foreground'>
          StockPros outputs are informational and educational only. They are not
          personalized financial, legal, tax, or fiduciary advice.
        </p>
      </footer>
    </div>
  )
}
