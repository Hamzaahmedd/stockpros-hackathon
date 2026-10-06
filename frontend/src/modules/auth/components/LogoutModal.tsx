// src/components/LogoutModal.tsx
import React from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'

interface LogoutModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const { user } = useAuth()

  if (!isOpen) return null

  return createPortal(
    <div className='fixed inset-0 z-[99999] flex items-center justify-center p-4'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 bg-[#000000]/80 backdrop-blur-md transition-opacity'
        onClick={onCancel}
      ></div>

      {/* Modal Content */}
      <div className='relative w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/5 bg-[#111318] p-8 shadow-2xl duration-200 animate-in fade-in zoom-in-95'>
        <div className='flex flex-col items-center text-center'>
          <h3 className='mb-3 text-[22px] font-bold leading-tight text-white'>
            Are you sure you want to log out?
          </h3>

          <p className='mb-8 px-2 text-[15px] text-gray-400'>
            Log out of{' '}
            <span className='font-medium text-gray-300'>StockPros</span> as{' '}
            <br />
            <span className='italic text-gray-300'>
              {user?.email || 'user'}
            </span>
            ?
          </p>

          <div className='flex w-full flex-col gap-3'>
            {/* Logout Button - Red from Sample 2 */}
            <button
              onClick={onConfirm}
              className='w-full rounded-full bg-[#ef4444] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-red-500/10 transition-all hover:bg-[#dc2626] active:scale-[0.98]'
            >
              Log out
            </button>

            {/* Cancel Button - Dark Gray from Sample 2 */}
            <button
              onClick={onCancel}
              className='w-full rounded-full bg-[#1f2229] py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[#2a2e38] active:scale-[0.98]'
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
