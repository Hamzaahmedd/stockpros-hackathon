// src/components/TopNav.tsx
import { LogoutModal, useAuth } from '@/modules/auth'
import { SECONDARY_ACTION_BTN } from '@/shared/utils/buttonStyles'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'

export const TopNav: React.FC = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)

  const handleLogout = async () => {
    setIsLogoutModalOpen(false)
    await logout()
    navigate('/login')
  }
  return (
    <nav className='bg-brand-800 text-white shadow-md'>
      <div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-3'>
        <div className='flex items-center gap-3'>
          <img
            src='/stockpros-logo.png'
            alt='Logo'
            className='h-10 w-10 object-contain'
          />
          <div>
            <div className='text-lg font-bold'>StockPros</div>
            <div className='text-brand-200 text-sm'>
              Realtime · Forecast · Analytics
            </div>
          </div>
        </div>

        <div className='flex items-center gap-4'>
          {user ? (
            <>
              <div className='text-sm'>{user.displayName || user.email}</div>
              <Button
                onClick={() => setIsLogoutModalOpen(true)}
                variant='secondary'
                size='sm'
                className={SECONDARY_ACTION_BTN}
              >
                Logout
              </Button>
            </>
          ) : (
            <div className='flex gap-2'>
              <a href='/login' className='text-sm hover:underline'>
                Sign in
              </a>
            </div>
          )}
        </div>
      </div>

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </nav>
  )
}
