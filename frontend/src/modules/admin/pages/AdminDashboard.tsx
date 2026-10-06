import { useAuth } from '@/modules/auth/hooks/useAuth'
import { Sidebar } from '@/shared/components/Sidebar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { useState } from 'react'
import { BillingTab } from '../components/BillingTab'
import { SystemTab } from '../components/SystemTab'
import { TeamsTab } from '../components/TeamsTab'
import { TelemetryTab } from '../components/TelemetryTab'
import { UsersTab } from '../components/UsersTab'
import { AdminTab } from '../constants'

const TABS: { id: AdminTab; label: string }[] = [
  { id: AdminTab.USERS, label: 'User lookup & plans' },
  { id: AdminTab.TEAMS, label: 'Team workspaces' },
  { id: AdminTab.BILLING, label: 'Billing, credits & webhooks' },
  { id: AdminTab.TELEMETRY, label: 'Queue health' },
  { id: AdminTab.SYSTEM, label: 'System & audit log' },
]

/** Internal staff ops panel. Mounted only for staff roles in the tier-based workflow (see App routes). */
export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState<AdminTab>(AdminTab.USERS)
  const role = user?.platformRole ?? 'USER'

  return (
    <div className='flex h-screen overflow-hidden bg-background text-foreground transition-all duration-300'>
      <Sidebar />

      <main id='main-content' className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-[1200px] p-4 lg:p-8'>
          <header className='mb-6 flex flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
              Staff operations
            </h1>
            <Badge variant='secondary'>{role}</Badge>
          </header>

          <div
            role='tablist'
            aria-label='Admin sections'
            className='mb-6 flex flex-wrap gap-2 border-b border-border pb-3'
          >
            {TABS.map((t) => (
              <Button
                key={t.id}
                type='button'
                role='tab'
                aria-selected={tab === t.id}
                size='sm'
                variant={tab === t.id ? 'default' : 'ghost'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === AdminTab.USERS && <UsersTab role={role} />}
          {tab === AdminTab.TEAMS && <TeamsTab role={role} />}
          {tab === AdminTab.BILLING && <BillingTab role={role} />}
          {tab === AdminTab.TELEMETRY && <TelemetryTab />}
          {tab === AdminTab.SYSTEM && <SystemTab role={role} />}
        </div>
      </main>
    </div>
  )
}
