import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { FiAlertTriangle } from 'react-icons/fi'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'

interface ConfirmationModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'success' | 'info'
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  useFocusTrap(
    modalRef,
    isOpen,
    onCancel,
    variant === 'danger' ? cancelButtonRef : undefined,
  )

  if (!isOpen) return null

  const getVariantColor = () => {
    switch (variant) {
      case 'danger':
        return 'bg-[#ef4444] hover:bg-[#dc2626] shadow-red-500/20'
      case 'success':
        return 'bg-[#10b981] hover:bg-[#059669] shadow-emerald-500/20'
      default:
        return 'bg-[#06b6d4] hover:bg-[#0891b2] shadow-cyan-500/20'
    }
  }

  return createPortal(
    <div className='fixed inset-0 z-[99999] flex items-center justify-center p-4 text-white'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity'
        onClick={onCancel}
      ></div>

      {/* Modal Content */}
      <div
        ref={modalRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='confirmation-modal-title'
        className='relative w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/5 bg-[#111318] p-8 shadow-2xl duration-200 animate-in fade-in zoom-in-95'
      >
        <div className='flex flex-col items-center text-center'>
          <h3
            id='confirmation-modal-title'
            className='mb-3 text-[22px] font-bold leading-tight tracking-tight text-white'
          >
            {title}
          </h3>

          <p className='mb-8 px-2 text-[15px] leading-relaxed text-gray-400'>
            {message}
          </p>

          <div className='flex w-full flex-col gap-3'>
            <button
              onClick={() => {
                onConfirm()
                onCancel()
              }}
              className={`w-full rounded-full py-3.5 text-[15px] font-bold text-white shadow-lg transition-all active:scale-[0.98] ${
                variant === 'success'
                  ? 'bg-[#10b981] shadow-emerald-500/10 hover:bg-[#059669]'
                  : variant === 'danger'
                    ? 'bg-[#ef4444] shadow-red-500/10 hover:bg-[#dc2626]'
                    : 'bg-[#06b6d4] shadow-cyan-500/10 hover:bg-[#0891b2]'
              }`}
            >
              {confirmText}
            </button>

            <button
              ref={cancelButtonRef}
              onClick={onCancel}
              className='w-full rounded-full bg-[#1f2229] py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[#2a2e38] active:scale-[0.98]'
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
