import {
  AnnouncementAnchor,
  NavBadgePill,
  anchorProps,
  useNavBadge,
} from '@/modules/announcements'
import { LogoutModal, useAuth } from '@/modules/auth'
import { FeedbackWidget } from '@/modules/feedback'
import { UnifiedNotifications } from '@/modules/notifications'
import { isStaffRole } from '@/modules/admin/utils'
import { preloader } from '@/shared/utils/preloader'
import React, { useEffect, useState } from 'react'
import {
  FiActivity,
  FiBarChart2,
  FiBriefcase,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiHome,
  FiLogOut,
  FiMessageSquare,
  FiRadio,
  FiSettings,
  FiStar,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'

/* ---------------- Navigation Item ---------------- */

interface NavItemProps {
  readonly to: string
  readonly icon: React.ReactNode
  readonly label: string
  readonly active?: boolean
  readonly collapsed?: boolean
}

/** Sidebar entries a spotlight can point at. */
const NAV_ANCHORS: Readonly<Record<string, AnnouncementAnchor>> = {
  '/teams': AnnouncementAnchor.SIDEBAR_WORKSPACE,
  '/plans': AnnouncementAnchor.PLANS_UPGRADE,
  '/settings': AnnouncementAnchor.SETTINGS_PREFERENCES,
}

function NavItem({
  to,
  icon,
  label,
  active = false,
  collapsed = false,
}: NavItemProps) {
  const { badge, onVisit } = useNavBadge(to)
  const anchor = NAV_ANCHORS[to]

  return (
    <Link
      to={to}
      onClick={onVisit}
      {...(anchor ? anchorProps(anchor) : {})}
      onMouseEnter={() => preloader.preloadRoute(to)}
      onMouseLeave={() => preloader.cancelPreloadRoute(to)}
      onFocus={() => preloader.preloadRoute(to)}
      className={`flex items-center gap-3 rounded-md px-3 py-2 transition-all duration-200 ${
        active
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
      } ${collapsed ? 'relative justify-center px-0' : 'relative w-full'}`}
      title={collapsed ? label : ''}
    >
      <span className='text-lg'>{icon}</span>
      {!collapsed && <span className='text-sm font-medium'>{label}</span>}
      {badge && <NavBadgePill badge={badge} collapsed={collapsed} />}
    </Link>
  )
}

/* ---------------- Sub-menus ---------------- */

interface DecisionSupportMenuProps {
  readonly pathname: string
  readonly isCollapsed: boolean
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly isPortfolioManager: boolean
}

function DecisionSupportMenu({
  pathname,
  isCollapsed,
  isOpen,
  onToggle,
  isPortfolioManager,
}: DecisionSupportMenuProps) {
  return (
    <div className='mt-2'>
      <button
        type='button'
        onClick={onToggle}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 transition-all ${
          pathname.startsWith('/decision-support')
            ? 'bg-secondary font-medium text-secondary-foreground'
            : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <FiBarChart2 className='text-lg' />
        {!isCollapsed && (
          <>
            <span className='text-sm font-medium'>Decision Support</span>
            <FiChevronDown
              className={`ml-auto transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </>
        )}
      </button>

      {!isCollapsed && isOpen && (
        <div className='ml-8 mt-1 space-y-1'>
          <Link
            to='/decision-support/radar'
            onMouseEnter={() =>
              preloader.preloadRoute('/decision-support/radar')
            }
            onFocus={() => preloader.preloadRoute('/decision-support/radar')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
              pathname === '/decision-support/radar'
                ? 'bg-secondary/50 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <FiRadio className='text-xs' />
            AI Radar
          </Link>

          <Link
            to='/decision-support/market-analysis'
            onMouseEnter={() =>
              preloader.preloadRoute('/decision-support/market-analysis')
            }
            onFocus={() =>
              preloader.preloadRoute('/decision-support/market-analysis')
            }
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
              pathname === '/decision-support/market-analysis'
                ? 'bg-secondary/50 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <FiActivity className='text-xs' />
            Market Analysis
          </Link>

          {isPortfolioManager && (
            <Link
              to='/decision-support/portfolio-health'
              onMouseEnter={() =>
                preloader.preloadRoute('/decision-support/portfolio-health')
              }
              onFocus={() =>
                preloader.preloadRoute('/decision-support/portfolio-health')
              }
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                pathname === '/decision-support/portfolio-health'
                  ? 'bg-secondary/50 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <FiBriefcase className='text-xs' />
              Portfolio Health
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

interface AccessControlMenuProps {
  readonly pathname: string
  readonly isCollapsed: boolean
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly canSeeUsers: boolean
  readonly isAdminOrRoleReader: boolean
}

function AccessControlMenu({
  pathname,
  isCollapsed,
  isOpen,
  onToggle,
  canSeeUsers,
  isAdminOrRoleReader,
}: AccessControlMenuProps) {
  return (
    <div className='mt-2'>
      <button
        type='button'
        onClick={onToggle}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 transition-all ${
          pathname.startsWith('/access-control')
            ? 'bg-secondary font-medium text-secondary-foreground'
            : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <FiShield className='text-lg' />
        {!isCollapsed && (
          <>
            <span className='text-sm font-medium'>Access Control</span>
            <FiChevronDown
              className={`ml-auto transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </>
        )}
      </button>

      {!isCollapsed && isOpen && (
        <div className='ml-8 mt-1 space-y-1'>
          {canSeeUsers && (
            <Link
              to='/access-control/users'
              onMouseEnter={() =>
                preloader.preloadRoute('/access-control/users')
              }
              onFocus={() => preloader.preloadRoute('/access-control/users')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                pathname === '/access-control/users'
                  ? 'bg-secondary/50 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <FiUsers className='text-xs' />
              Users
            </Link>
          )}

          {isAdminOrRoleReader && (
            <Link
              to='/access-control/roles'
              onMouseEnter={() =>
                preloader.preloadRoute('/access-control/roles')
              }
              onFocus={() => preloader.preloadRoute('/access-control/roles')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                pathname === '/access-control/roles'
                  ? 'bg-secondary/50 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <FiShield className='text-xs' />
              Roles
            </Link>
          )}

          {isAdminOrRoleReader && (
            <Link
              to='/access-control/feedback'
              onMouseEnter={() =>
                preloader.preloadRoute('/access-control/feedback')
              }
              onFocus={() => preloader.preloadRoute('/access-control/feedback')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                pathname === '/access-control/feedback'
                  ? 'bg-secondary/50 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <FiMessageSquare className='text-xs' />
              Feedback
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function getUserInitials(
  displayName?: string | null,
  email?: string | null,
): string {
  const fullName = (displayName || '').trim()
  if (!fullName) return (email?.charAt(0) || 'U').toUpperCase()
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const firstChar = parts[0][0] || ''
    const lastChar = parts.at(-1)?.[0] || ''
    return (firstChar + lastChar).toUpperCase()
  }
  return fullName.slice(0, 2).toUpperCase()
}

/* ---------------- Sidebar ---------------- */

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDecisionOpen, setIsDecisionOpen] = useState(false)
  const [isAccessControlOpen, setIsAccessControlOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isOpenMobile, setIsOpenMobile] = useState(false)

  const { user, can, logout, pricingTiersEnabled } = useAuth()
  // Staff ops panel exists only in the tier-based workflow, for staff platform roles.
  const showStaffOps = pricingTiersEnabled && isStaffRole(user?.platformRole)

  const canReadCoreApp = can('CORE_APP', 'canRead')
  const canReadPortfolio = can('PORTFOLIO', 'canRead')
  const canReadRole = can('ROLE', 'canRead')
  const canReadAccessControl = can('ACCESS_CONTROL', 'canRead')
  // Standard navigation is controlled directly by CORE_APP:READ.
  const showStandardMenus = canReadCoreApp
  // Portfolio Health section is gated to users with portfolio read access
  const isPortfolioManager = canReadPortfolio
  const canSeeAccessControl = canReadAccessControl && canReadRole
  const canSeeUsers = canReadRole
  const isAdminOrRoleReader = canReadRole

  useEffect(() => {
    if (pathname.startsWith('/decision-support')) {
      setIsDecisionOpen(true)
    }
    if (pathname.startsWith('/access-control')) {
      setIsAccessControlOpen(true)
    }
  }, [pathname])

  const handleLogout = async () => {
    setIsLogoutModalOpen(false)
    await logout()
    navigate('/login')
  }

  const navItemsPrimary = [
    { to: '/dashboard', icon: <FiTrendingUp />, label: 'Dashboard' },
    { to: '/watchlist', icon: <FiActivity />, label: 'Watchlist' },
    { to: '/market', icon: <FiHome />, label: 'Market' },
    { to: '/forecast', icon: <FiTarget />, label: 'Forecast' },
  ]

  const navItemsSecondary = [
    { to: '/news', icon: <FiFileText />, label: 'News' },
    ...(pricingTiersEnabled
      ? [{ to: '/plans', icon: <FiStar />, label: 'Plans' }]
      : []),
    ...(user?.plan === 'TEAM'
      ? [{ to: '/teams', icon: <FiUsers />, label: 'Workspace' }]
      : []),
    ...(showStaffOps
      ? [{ to: '/admin', icon: <FiShield />, label: 'Staff ops' }]
      : []),
    { to: '/settings', icon: <FiSettings />, label: 'Settings' },
  ]

  return (
    <>
      <a
        href='#main-content'
        className='sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-bold focus:text-primary-foreground focus:shadow-lg'
      >
        Skip to main content
      </a>

      {/* Mobile Toggle Button */}
      <Button
        type='button'
        variant='outline'
        size='icon'
        onClick={() => setIsOpenMobile(!isOpenMobile)}
        className='fixed bottom-6 right-6 z-[120] h-14 w-14 rounded-full border border-border bg-card text-primary shadow-2xl transition-all hover:bg-muted active:scale-95 lg:hidden'
      >
        {isOpenMobile ? (
          <FiChevronLeft size={24} />
        ) : (
          <FiChevronRight size={24} />
        )}
      </Button>

      {/* Backdrop for mobile */}
      {isOpenMobile && (
        <button
          type='button'
          aria-label='Close menu'
          className='fixed inset-0 z-[100] cursor-default bg-black/60 backdrop-blur-sm lg:hidden'
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[110] flex h-screen flex-col border-r bg-background transition-all duration-300 lg:sticky ${isCollapsed ? 'w-16' : 'w-64'} ${
          isOpenMobile
            ? 'translate-x-0 shadow-2xl'
            : '-translate-x-full lg:translate-x-0'
        } lg:w-auto ${isCollapsed ? 'lg:w-16' : 'lg:w-64'} `}
      >
        {/* Floating Toggle Button */}
        <Button
          type='button'
          variant='outline'
          size='icon'
          onClick={() => setIsCollapsed(!isCollapsed)}
          className='group-toggle absolute -right-3 top-7 z-[120] hidden h-6 w-6 items-center justify-center rounded-full border-border bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:text-foreground lg:flex'
          title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          {isCollapsed ? (
            <FiChevronRight size={12} />
          ) : (
            <FiChevronLeft size={12} />
          )}
        </Button>

        {/* Logo */}
        <div className='flex h-[60px] items-center px-4 py-5'>
          <div className='flex items-center gap-3'>
            <img
              src='/stockpros-logo.png'
              alt='Logo'
              className='h-10 w-10 object-contain'
            />
            {!isCollapsed && (
              <span className='text-lg font-bold'>StockPros</span>
            )}
          </div>
        </div>

        {showStandardMenus && (
          <div
            className={`mb-4 flex px-4 transition-all ${
              isCollapsed ? 'justify-center' : 'gap-2'
            }`}
          >
            <UnifiedNotifications />
            <FeedbackWidget />
          </div>
        )}

        {/* Navigation */}
        <nav className='custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3'>
          {showStandardMenus &&
            navItemsPrimary.map((item) => (
              <NavItem
                key={item.to}
                {...item}
                active={pathname.startsWith(item.to)}
                collapsed={isCollapsed}
              />
            ))}

          {showStandardMenus && (
            <DecisionSupportMenu
              pathname={pathname}
              isCollapsed={isCollapsed}
              isOpen={isDecisionOpen}
              onToggle={() => setIsDecisionOpen(!isDecisionOpen)}
              isPortfolioManager={isPortfolioManager}
            />
          )}

          {showStandardMenus &&
            navItemsSecondary.map((item) => (
              <NavItem
                key={item.to}
                {...item}
                active={pathname.startsWith(item.to)}
                collapsed={isCollapsed}
              />
            ))}

          {canSeeAccessControl && (
            <AccessControlMenu
              pathname={pathname}
              isCollapsed={isCollapsed}
              isOpen={isAccessControlOpen}
              onToggle={() => {
                const willOpen = !isAccessControlOpen
                setIsAccessControlOpen(willOpen)
                if (willOpen && canSeeUsers) {
                  navigate('/access-control/users')
                }
              }}
              canSeeUsers={canSeeUsers}
              isAdminOrRoleReader={isAdminOrRoleReader}
            />
          )}
        </nav>

        {/* ---------------- User & Logout ---------------- */}
        <div className='mt-auto px-4 pb-6'>
          {!isCollapsed && (
            <div className='mb-4 flex items-center gap-3 rounded-lg bg-secondary/30 p-3'>
              <Avatar className='h-10 w-10 shadow-sm'>
                <AvatarImage src='' alt='User Avatar' />
                <AvatarFallback className='select-none bg-primary font-bold text-primary-foreground'>
                  {getUserInitials(user?.displayName, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className='overflow-hidden'>
                <div className='truncate text-sm font-medium text-foreground'>
                  {user?.displayName || user?.email || ''}
                </div>
                <div className='truncate text-xs text-muted-foreground'>
                  {user?.email}
                </div>
              </div>
            </div>
          )}

          <Button
            type='button'
            variant='ghost'
            onClick={() => setIsLogoutModalOpen(true)}
            className={`flex w-full items-center gap-2 transition ${
              isCollapsed
                ? 'justify-center p-2'
                : 'justify-start px-3 font-normal'
            } text-muted-foreground hover:text-foreground`}
          >
            <FiLogOut className='h-5 w-5' />
            {!isCollapsed && <span className='text-sm'>Log out</span>}
          </Button>
        </div>

        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogout}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </aside>
    </>
  )
}
