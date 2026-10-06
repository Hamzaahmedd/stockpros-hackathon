import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import React, { useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  /** Tailwind max-width class for the panel. */
  widthClass?: string
}

/** Accessible portal modal (focus trap + Escape) shared by the billing and workspace dialogs. */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  widthClass = 'max-w-md',
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen, onClose)

  if (!isOpen) return null

  return createPortal(
    <div className='fixed inset-0 z-[99999] flex items-center justify-center p-4'>
      <button
        type='button'
        aria-label='Close dialog'
        className='absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm'
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='modal-title'
        className={`relative w-full ${widthClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl duration-200 animate-in fade-in zoom-in-95`}
      >
        <h2 id='modal-title' className='text-lg font-semibold'>
          {title}
        </h2>
        {description && (
          <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        )}
        <div className='mt-5'>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
