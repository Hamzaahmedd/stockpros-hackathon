import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { CreditLedgerPanel } from '@/modules/plans/components/CreditLedgerPanel'
import { QuotaMeter } from '@/modules/plans/components/QuotaMeter'
import { isPaidPlan } from '@/modules/plans/utils'
import { PreferencesPanel } from '@/modules/teams/components/PreferencesPanel'
import { Sidebar } from '@/shared/components/Sidebar'
import { useTheme } from '@/shared/hooks/useTheme'
import { notificationService } from '@/modules/notifications/services'
import {
  MARKET_INTEREST_OPTIONS,
  type MarketInterest,
} from '@/modules/notifications/types'
import {
  Activity,
  Bell,
  Check,
  Cpu,
  FileText,
  Landmark,
  Mail,
  ShoppingBag,
  TrendingUp,
  Zap,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import {
  FiCheck,
  FiCreditCard,
  FiLayout,
  FiMonitor,
  FiMoon,
  FiSliders,
  FiSun,
} from 'react-icons/fi'
import { toast } from 'react-toastify'

const MARKET_TOPICS: {
  id: MarketInterest
  name: string
  icon: React.ElementType
  description: string
}[] = [
  {
    id: 'ai_tech',
    name: 'AI & Tech',
    icon: Cpu,
    description: 'Semiconductors, LLMs, cloud',
  },
  {
    id: 'energy',
    name: 'Energy',
    icon: Zap,
    description: 'Oil, gas, clean renewables',
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: Landmark,
    description: 'Banks, fintech, payments',
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    icon: Activity,
    description: 'Biotech, medtech, pharma',
  },
  {
    id: 'growth',
    name: 'Growth Stocks',
    icon: TrendingUp,
    description: 'High-momentum tech & SaaS',
  },
  {
    id: 'consumer',
    name: 'Consumer',
    icon: ShoppingBag,
    description: 'Retail, e-commerce, staples',
  },
]

interface AlertOption {
  id: string
  title: string
  description: string
  icon: React.ElementType
  disabled?: boolean
}

const ALERT_OPTIONS: AlertOption[] = [
  {
    id: 'in_app',
    title: 'In-App Real-Time Alerts',
    description:
      'Instant pop-up triggers when prices cross key levels or AI signals fire.',
    icon: Bell,
  },
  {
    id: 'email_alerts',
    title: 'Email Volatility Alerts',
    description:
      'Direct email notifications for critical stop-loss or take-profit breaches.',
    icon: Mail,
  },
  {
    id: 'daily_digest',
    title: 'Daily Pre-Market Digest',
    description:
      'Receive a weekday pre-market briefing for your active watchlist at 8:30 AM New York time.',
    icon: FileText,
  },
]

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT'

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const hasCredits = isPaidPlan(user?.plan)
  const [activeTab, setActiveTab] = useState('appearance')

  // Market & Alert preferences state
  const [selectedTopics, setSelectedTopics] = useState<MarketInterest[]>([])
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([])
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePhrase, setDeletePhrase] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const loadNotificationPreferences = async () => {
      try {
        const preferences = await notificationService.getPreferences()
        setSelectedTopics(
          preferences.marketInterests.filter((t) =>
            (MARKET_INTEREST_OPTIONS as readonly string[]).includes(t),
          ),
        )
        setSelectedAlerts([
          ...(preferences.inAppAlertsEnabled ? ['in_app'] : []),
          ...(preferences.emailVolatilityAlertsEnabled ? ['email_alerts'] : []),
          ...(preferences.dailyDigestEnabled ? ['daily_digest'] : []),
        ])
      } catch {
        toast.error('Failed to load notification preferences.')
      } finally {
        setPreferencesLoaded(true)
      }
    }

    void loadNotificationPreferences()
  }, [])

  const toggleTopic = (topicId: MarketInterest) => {
    setSelectedTopics((prev) =>
      prev.includes(topicId)
        ? prev.filter((t) => t !== topicId)
        : [...prev, topicId],
    )
  }

  const toggleAlert = (alertId: string) => {
    const opt = ALERT_OPTIONS.find((o) => o.id === alertId)
    if (opt?.disabled) return

    setSelectedAlerts((prev) => {
      const isSelected = prev.includes(alertId)
      const updated = isSelected
        ? prev.filter((a) => a !== alertId)
        : [...prev, alertId]

      return updated
    })
  }

  const handleSavePreferences = async () => {
    if (!preferencesLoaded) return

    try {
      setIsSavingPreferences(true)
      await notificationService.updatePreferences({
        marketInterests: selectedTopics,
        inAppAlertsEnabled: selectedAlerts.includes('in_app'),
        emailVolatilityAlertsEnabled: selectedAlerts.includes('email_alerts'),
        dailyDigestEnabled: selectedAlerts.includes('daily_digest'),
      })
      toast.success('Preferences updated successfully!')
    } catch {
      toast.error('Failed to save notification preferences.')
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handleCancelDelete = () => {
    if (isDeleting) return
    setShowDeleteConfirm(false)
    setDeletePhrase('')
  }

  const handleDeleteAccount = async () => {
    if (deletePhrase.trim() !== CONFIRMATION_PHRASE || isDeleting) return
    setIsDeleting(true)
    try {
      const { deleteAccount } = await import('@/modules/auth/services')
      const { clearAccessToken } = await import('@/shared/utils/token')
      await deleteAccount(CONFIRMATION_PHRASE)
      clearAccessToken()
      toast.success('Account deleted. Redirecting…')
      setTimeout(() => {
        window.location.href = '/auth/login'
      }, 1500)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        'Failed to delete account. Please try again.'
      toast.error(msg)
      setIsDeleting(false)
    }
  }

  const phraseMatches = deletePhrase.trim() === CONFIRMATION_PHRASE

  return (
    <div className='flex h-screen overflow-hidden bg-background text-foreground transition-all duration-300'>
      <Sidebar />

      <main id='main-content' className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-[1400px] p-4 lg:p-8'>
          <header className='mb-10'>
            <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
              Settings
            </h1>
            <p className='mt-1 text-sm font-medium text-muted-foreground'>
              Optimize your trading workspace, manage market interests, and
              adjust notification preferences.
            </p>
          </header>

          <div className='grid gap-8 lg:grid-cols-12'>
            {/* Sidebar Navigation */}
            <div className='space-y-2 lg:col-span-3'>
              {[
                {
                  id: 'appearance',
                  label: 'Appearance',
                  icon: <FiLayout className='text-lg' />,
                },
                {
                  id: 'preferences',
                  label: 'Market & Alerts',
                  icon: <FiSliders className='text-lg' />,
                },
                ...(hasCredits
                  ? [
                      {
                        id: 'credits',
                        label: 'Credits',
                        icon: <FiCreditCard className='text-lg' />,
                      },
                    ]
                  : []),
                {
                  id: 'account',
                  label: 'Account',
                  icon: (
                    <svg
                      className='h-[1.1em] w-[1.1em]'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                    >
                      <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
                      <circle cx='12' cy='7' r='4' />
                    </svg>
                  ),
                },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setShowDeleteConfirm(false)
                    setDeletePhrase('')
                  }}
                  className={`flex h-12 w-full items-center justify-start gap-4 rounded-md text-xs font-bold uppercase tracking-widest ${
                    tab.id === 'account' && activeTab !== 'account'
                      ? 'hover:border-red-500/30 hover:text-red-400'
                      : ''
                  }`}
                >
                  {tab.icon} {tab.label}
                </Button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className='transition-all duration-300 lg:col-span-9'>
              {/* --- APPEARANCE TAB --- */}
              {activeTab === 'appearance' && (
                <Card className='rounded-lg border border-border bg-card shadow-lg transition-all duration-300'>
                  <CardHeader className='mb-6 flex flex-row items-center gap-5 border-b border-border p-8'>
                    <div className='rounded-lg bg-primary/10 p-3 text-primary'>
                      <FiMonitor className='text-2xl' />
                    </div>
                    <div>
                      <CardTitle className='text-xl font-bold'>
                        Workspace Theme
                      </CardTitle>
                      <CardDescription className='text-sm font-medium'>
                        Choose your preferred visual environment.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                      {/* Light Mode Card */}
                      <button
                        type='button'
                        onClick={() => setTheme('light')}
                        aria-pressed={theme === 'light'}
                        className={`group relative w-full cursor-pointer overflow-hidden rounded-lg border-2 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          theme === 'light'
                            ? 'border-primary ring-2 ring-primary/10'
                            : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className='p-6'>
                          <div className='relative mb-6 aspect-[16/10] overflow-hidden rounded-md border border-border bg-white shadow-inner'>
                            <div className='absolute left-4 top-4 h-2 w-12 rounded-full bg-gray-200' />
                            <div className='absolute left-4 top-8 h-1.5 w-20 rounded-full bg-gray-100' />
                            <div className='absolute inset-0 flex items-center justify-center'>
                              <FiSun
                                className={`transform text-4xl transition-transform group-hover:scale-110 ${
                                  theme === 'light'
                                    ? 'text-yellow-500'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                          </div>
                          <div className='flex items-center justify-between'>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-widest ${
                                theme === 'light'
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              System Light
                            </span>
                            {theme === 'light' && (
                              <FiCheck className='text-primary' />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Dark Mode Card */}
                      <button
                        type='button'
                        onClick={() => setTheme('dark')}
                        aria-pressed={theme === 'dark'}
                        className={`group relative w-full cursor-pointer overflow-hidden rounded-lg border-2 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          theme === 'dark'
                            ? 'border-primary ring-2 ring-primary/10'
                            : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className='p-6'>
                          <div className='relative mb-6 aspect-[16/10] overflow-hidden rounded-md border border-border bg-[#020817] shadow-inner'>
                            <div className='absolute left-4 top-4 h-2 w-12 rounded-full bg-white/10' />
                            <div className='absolute left-4 top-8 h-1.5 w-20 rounded-full bg-white/5' />
                            <div className='absolute inset-0 flex items-center justify-center'>
                              <FiMoon
                                className={`transform text-4xl transition-transform group-hover:scale-110 ${
                                  theme === 'dark'
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                          </div>
                          <div className='flex items-center justify-between'>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-widest ${
                                theme === 'dark'
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              System Dark
                            </span>
                            {theme === 'dark' && (
                              <FiCheck className='text-primary' />
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* --- MARKET & ALERTS PREFERENCES TAB --- */}
              {activeTab === 'appearance' && (
                <Card className='mt-6 rounded-lg border border-border bg-card shadow-lg'>
                  <CardHeader className='border-b border-border p-8'>
                    <CardTitle className='text-xl font-bold'>
                      Display preferences
                    </CardTitle>
                    <CardDescription className='text-sm font-medium'>
                      {user?.plan === 'TEAM'
                        ? "Your choices override your workspace's defaults."
                        : 'Saved to your profile.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='p-8'>
                    <PreferencesPanel
                      mode='personal'
                      inWorkspace={user?.plan === 'TEAM'}
                    />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'credits' && hasCredits && (
                <Card className='rounded-lg border border-border bg-card shadow-lg'>
                  <CardHeader className='border-b border-border p-8'>
                    <CardTitle className='text-xl font-bold'>Credits</CardTitle>
                    <CardDescription className='text-sm font-medium'>
                      Your top-ups and pay-as-you-go usage after your monthly AI
                      quota.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-8 p-8'>
                    <QuotaMeter />
                    <CreditLedgerPanel scope='USER' />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'preferences' && (
                <Card className='rounded-lg border border-border bg-card shadow-lg transition-all duration-300'>
                  <CardHeader className='mb-6 flex flex-row items-center gap-5 border-b border-border p-8'>
                    <div className='rounded-lg bg-primary/10 p-3 text-primary'>
                      <FiSliders className='text-2xl' />
                    </div>
                    <div>
                      <CardTitle className='text-xl font-bold'>
                        Market Interests & Alerts
                      </CardTitle>
                      <CardDescription className='text-sm font-medium'>
                        Personalize the news feed filters and notifications
                        configured during onboarding.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-8 p-8 pt-0'>
                    {/* Market Interests Section */}
                    <div>
                      <div className='mb-4 flex items-center justify-between'>
                        <div>
                          <h3 className='text-sm font-bold uppercase tracking-wider text-foreground'>
                            Market Sectors & Themes
                          </h3>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            Save the sectors and themes that matter most to you.
                          </p>
                        </div>
                        <span className='text-xs text-muted-foreground'>
                          Selected:{' '}
                          <strong className='text-primary'>
                            {selectedTopics.length}
                          </strong>
                        </span>
                      </div>

                      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                        {MARKET_TOPICS.map((topic) => {
                          const active = selectedTopics.includes(topic.id)
                          const Icon = topic.icon
                          return (
                            <button
                              key={topic.id}
                              type='button'
                              onClick={() => toggleTopic(topic.id)}
                              className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition-all duration-200 ${
                                active
                                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/40'
                                  : 'border-border bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40'
                              }`}
                            >
                              <div className='flex items-center gap-2 truncate'>
                                <div
                                  className={`shrink-0 rounded-lg p-1.5 ${
                                    active
                                      ? 'bg-cyan-500/20 text-cyan-300'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  <Icon className='h-4 w-4' />
                                </div>
                                <span className='truncate text-xs font-semibold text-foreground'>
                                  {topic.name}
                                </span>
                              </div>
                              {active && (
                                <Check className='h-3.5 w-3.5 shrink-0 text-cyan-400' />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Alert Channels Section */}
                    <div>
                      <div className='mb-4'>
                        <h3 className='text-sm font-bold uppercase tracking-wider text-foreground'>
                          Alert Channels
                        </h3>
                        <p className='mt-0.5 text-xs text-muted-foreground'>
                          Configure where volatility notices and intelligence
                          digests are routed.
                        </p>
                      </div>

                      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                        {ALERT_OPTIONS.map((opt) => {
                          const active = selectedAlerts.includes(opt.id)
                          const Icon = opt.icon
                          const isDisabled = opt.disabled
                          return (
                            <button
                              key={opt.id}
                              type='button'
                              onClick={() => toggleAlert(opt.id)}
                              disabled={isDisabled}
                              className={`flex flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                                isDisabled
                                  ? 'cursor-not-allowed border-border/50 bg-muted/10 text-muted-foreground opacity-50'
                                  : active
                                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/30'
                                    : 'border-border bg-muted/20 text-muted-foreground hover:border-border'
                              }`}
                            >
                              <div className='flex w-full items-center justify-between'>
                                <div
                                  className={`rounded-lg p-2 ${
                                    isDisabled
                                      ? 'bg-muted/40 text-muted-foreground'
                                      : active
                                        ? 'bg-cyan-500/20 text-cyan-300'
                                        : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  <Icon className='h-4 w-4' />
                                </div>
                                <div className='flex items-center gap-2'>
                                  <div
                                    className={`flex h-5 w-5 items-center justify-center rounded transition ${
                                      isDisabled
                                        ? 'border border-border/40 text-transparent'
                                        : active
                                          ? 'bg-cyan-500 font-bold text-black'
                                          : 'border border-border'
                                    }`}
                                  >
                                    {active && !isDisabled && (
                                      <Check className='h-3.5 w-3.5' />
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className='text-xs font-bold text-foreground'>
                                  {opt.title}
                                </p>
                                <p className='mt-1 text-[11px] leading-relaxed text-muted-foreground'>
                                  {opt.description}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className='flex justify-end border-t border-border pt-4'>
                      <Button
                        type='button'
                        onClick={handleSavePreferences}
                        disabled={isSavingPreferences || !preferencesLoaded}
                        className='h-11 bg-primary px-6 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90'
                      >
                        {isSavingPreferences ? 'Saving...' : 'Save Preferences'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* --- ACCOUNT TAB --- */}
              {activeTab === 'account' && (
                <div className='space-y-6'>
                  {/* Account Info Card */}
                  <Card className='rounded-lg border border-border bg-card shadow-lg'>
                    <CardHeader className='flex flex-row items-center gap-5 border-b border-border p-8'>
                      <div className='rounded-lg bg-primary/10 p-3 text-primary'>
                        <svg
                          className='h-6 w-6'
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                        >
                          <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
                          <circle cx='12' cy='7' r='4' />
                        </svg>
                      </div>
                      <div>
                        <CardTitle className='text-xl font-bold'>
                          Account Management
                        </CardTitle>
                        <CardDescription className='text-sm font-medium'>
                          Manage your account settings and data.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className='p-8'>
                      <p className='text-sm leading-relaxed text-muted-foreground'>
                        Your account is protected and your data is stored
                        securely. If you wish to permanently remove your account
                        and all associated data, you can do so in the Danger
                        Zone below.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Danger Zone Card */}
                  <div className='relative overflow-hidden rounded-xl border border-red-500/40 bg-red-950/10 shadow-lg shadow-red-950/10'>
                    <div className='absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent' />

                    <div className='p-8'>
                      <div className='mb-6 flex items-center gap-3'>
                        <div className='rounded-lg bg-red-500/15 p-2 text-red-400'>
                          <svg
                            className='h-5 w-5'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                          >
                            <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                            <line x1='12' y1='9' x2='12' y2='13' />
                            <line x1='12' y1='17' x2='12.01' y2='17' />
                          </svg>
                        </div>
                        <div>
                          <h3 className='text-base font-bold uppercase tracking-wider text-red-400'>
                            Danger Zone
                          </h3>
                          <p className='mt-0.5 text-xs text-red-400/70'>
                            These actions are irreversible. Proceed with
                            caution.
                          </p>
                        </div>
                      </div>

                      <div className='flex items-start justify-between gap-6'>
                        <div>
                          <p className='mb-1 text-sm font-semibold text-foreground'>
                            Delete this account
                          </p>
                          <p className='max-w-lg text-xs leading-relaxed text-muted-foreground'>
                            Permanently delete your StockPros account and all of
                            your data. This action cannot be undone.
                          </p>
                        </div>
                        {!showDeleteConfirm && (
                          <button
                            id='btn-open-delete-confirm'
                            type='button'
                            onClick={() => setShowDeleteConfirm(true)}
                            className='h-10 shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 px-5 text-xs font-bold uppercase tracking-wider text-red-400 transition-all duration-200 hover:border-red-500 hover:bg-red-500/20'
                          >
                            Delete Account
                          </button>
                        )}
                      </div>

                      {/* Inline confirmation UI */}
                      {showDeleteConfirm && (
                        <div className='mt-6 space-y-5 rounded-xl border border-red-500/30 bg-red-950/20 p-6 duration-300 animate-in fade-in slide-in-from-top-2'>
                          <div className='space-y-3 rounded-lg border border-red-500/20 bg-red-900/10 p-4'>
                            <p className='flex items-center gap-2 text-sm font-bold text-red-400'>
                              <svg
                                className='h-4 w-4 shrink-0'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                              >
                                <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                                <line x1='12' y1='9' x2='12' y2='13' />
                                <line x1='12' y1='17' x2='12.01' y2='17' />
                              </svg>
                              Warning: Deleting your account is permanent and
                              cannot be undone.
                            </p>
                            <p className='text-xs font-medium text-red-300/80'>
                              You will immediately lose:
                            </p>
                            <ul className='space-y-1.5'>
                              {[
                                'Portfolio data & watchlists',
                                'Saved AI preferences & custom alerts',
                                'Premium feature access & account history',
                                'Active sessions on all devices',
                              ].map((item) => (
                                <li
                                  key={item}
                                  className='flex items-center gap-2 text-xs text-red-300/70'
                                >
                                  <span className='h-1 w-1 shrink-0 rounded-full bg-red-400' />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className='space-y-2'>
                            <label
                              htmlFor='delete-confirmation-input'
                              className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'
                            >
                              To confirm, type{' '}
                              <span className='font-mono font-bold text-red-400'>
                                {CONFIRMATION_PHRASE}
                              </span>{' '}
                              below:
                            </label>
                            <input
                              id='delete-confirmation-input'
                              type='text'
                              value={deletePhrase}
                              onChange={(e) => setDeletePhrase(e.target.value)}
                              placeholder={CONFIRMATION_PHRASE}
                              autoComplete='off'
                              spellCheck={false}
                              className={`h-11 w-full rounded-lg border bg-background/60 px-4 font-mono text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/40 ${
                                deletePhrase.length > 0 && !phraseMatches
                                  ? 'border-red-500/60 text-red-300 focus:border-red-500'
                                  : phraseMatches
                                    ? 'border-green-500/60 text-green-300 focus:border-green-500'
                                    : 'border-border focus:border-red-500/60'
                              }`}
                            />
                            {deletePhrase.length > 0 && !phraseMatches && (
                              <p className='text-[11px] text-red-400/80'>
                                Phrase doesn't match — type it exactly as shown
                                above.
                              </p>
                            )}
                          </div>

                          {/* ADD THIS BUTTON CONTAINER RIGHT AFTER THE INPUT BLOCK */}
                          <div className='flex items-center justify-end gap-3 pt-2'>
                            <Button
                              type='button'
                              variant='ghost'
                              onClick={handleCancelDelete}
                              disabled={isDeleting}
                              className='h-10 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground'
                            >
                              Cancel
                            </Button>
                            <Button
                              type='button'
                              onClick={handleDeleteAccount}
                              disabled={!phraseMatches || isDeleting}
                              className='h-10 bg-red-600 px-5 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
                            >
                              {isDeleting
                                ? 'Deleting...'
                                : 'Permanently Delete Account'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Settings
