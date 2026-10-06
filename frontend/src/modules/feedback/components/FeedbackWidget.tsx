// src/modules/feedback/components/FeedbackWidget.tsx
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { FiMessageSquare, FiCheckCircle, FiX } from 'react-icons/fi'
import { feedbackService } from '../services'

const MAX_LENGTH = 2000

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    onClose()
    // Reset after the close animation would run; safe since the portal unmounts.
    setMessage('')
    setError(null)
    setSubmitted(false)
  }

  const handleSubmit = async () => {
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Please enter a message before submitting.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await feedbackService.submit({ message: trimmed, page: pathname })
      setSubmitted(true)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Something went wrong sending your feedback. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className='fixed inset-0 z-[99999] flex items-center justify-center p-4'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 bg-[#000000]/80 backdrop-blur-md transition-opacity'
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div className='relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/5 bg-[#111318] p-8 shadow-2xl duration-200 animate-in fade-in zoom-in-95'>
        <button
          type='button'
          onClick={handleClose}
          aria-label='Close'
          className='absolute right-5 top-5 text-gray-500 transition-colors hover:text-white'
        >
          <FiX size={20} />
        </button>

        {submitted ? (
          <div className='flex flex-col items-center py-4 text-center'>
            <FiCheckCircle className='mb-4 text-cyan-400' size={40} />
            <h3 className='mb-2 text-[20px] font-bold text-white'>
              Thanks for the feedback!
            </h3>
            <p className='mb-6 px-2 text-[14px] text-gray-400'>
              We read every message and use it to improve StockPros.
            </p>
            <button
              onClick={handleClose}
              className='w-full rounded-full bg-[#1f2229] py-3 text-[15px] font-bold text-white transition-all hover:bg-[#2a2e38] active:scale-[0.98]'
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 className='mb-2 text-[20px] font-bold leading-tight text-white'>
              Send feedback
            </h3>
            <p className='mb-5 text-[14px] text-gray-400'>
              Found a bug, or have an idea for StockPros? Let us know.
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Tell us what's on your mind..."
              rows={5}
              autoFocus
              className='mb-2 w-full resize-none rounded-2xl border border-white/10 bg-[#1a1c24] p-4 text-[14px] text-gray-200 transition-colors placeholder:text-gray-600 focus:border-cyan-500/50 focus:outline-none'
            />
            <div className='mb-5 flex items-center justify-between'>
              <span className='text-[11px] text-gray-600'>
                {message.length}/{MAX_LENGTH}
              </span>
              {error && (
                <span className='text-[12px] text-red-400'>{error}</span>
              )}
            </div>

            <div className='flex w-full flex-col gap-3'>
              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className='w-full rounded-full bg-cyan-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-cyan-500/10 transition-all hover:bg-cyan-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'
              >
                {submitting ? 'Sending...' : 'Send feedback'}
              </button>
              <button
                onClick={handleClose}
                className='w-full rounded-full bg-[#1f2229] py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[#2a2e38] active:scale-[0.98]'
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export const FeedbackWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type='button'
        onClick={() => setIsOpen(true)}
        title='Send feedback'
        className='group relative rounded-xl border border-transparent p-2.5 text-gray-400 transition-all hover:border-black/5 hover:bg-cyan-500/5 hover:text-cyan-400 dark:hover:border-white/5'
      >
        <FiMessageSquare className='text-xl transition-transform group-active:scale-95' />
      </button>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
