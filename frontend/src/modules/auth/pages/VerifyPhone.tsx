import { zodResolver } from '@hookform/resolvers/zod'
import { RefreshCw } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useAuth } from '../hooks/useAuth'
import { requestPhoneOtp, verifyPhoneOtp } from '../services'
import { normalizePakistaniNumber } from '../utils/normalizePakistaniNumber'
import {
  requestPhoneOtpSchema,
  verifyPhoneOtpSchema,
  type RequestPhoneOtpFormValues,
  type VerifyPhoneOtpFormValues,
} from '../validation'

// Matches the 60-second cooldown enforced server-side in requestOtp.
const RESEND_COOLDOWN_SECONDS = 60

export const VerifyPhone: React.FC = () => {
  const navigate = useNavigate()
  const { refreshMe } = useAuth()
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const phoneForm = useForm<RequestPhoneOtpFormValues>({
    resolver: zodResolver(requestPhoneOtpSchema),
    defaultValues: { phoneNumber: '' },
  })

  const otpForm = useForm<VerifyPhoneOtpFormValues>({
    resolver: zodResolver(verifyPhoneOtpSchema),
    defaultValues: { code: '' },
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const requestCode = async (rawPhoneNumber: string) => {
    setIsSubmitting(true)
    try {
      const normalized = normalizePakistaniNumber(rawPhoneNumber)
      await requestPhoneOtp(normalized)
      setPhoneNumber(normalized)
      setStage('otp')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      toast.success('Verification code sent via WhatsApp.')
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to send verification code. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmitPhone = async (data: RequestPhoneOtpFormValues) => {
    await requestCode(data.phoneNumber)
  }

  const handleResend = async () => {
    if (cooldown > 0 || !phoneNumber || isSubmitting) return
    await requestCode(phoneNumber)
  }

  const onSubmitOtp = async (data: VerifyPhoneOtpFormValues) => {
    setIsSubmitting(true)
    try {
      await verifyPhoneOtp(data.code)
      toast.success('Phone number verified!')

      const verifiedUser = await refreshMe()
      if (
        !verifiedUser?.displayName ||
        verifiedUser.displayName.trim() === ''
      ) {
        navigate('/auth/onboarding', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          'Invalid or expired code. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (stage === 'otp') {
    return (
      <AuthLayout
        title='Verify your phone'
        subtitle={`Enter the 6-digit code sent to ${phoneNumber} via WhatsApp`}
      >
        <form
          onSubmit={otpForm.handleSubmit(onSubmitOtp)}
          className='space-y-6'
        >
          <Input
            id='code'
            type='text'
            inputMode='numeric'
            placeholder='123456'
            maxLength={6}
            error={otpForm.formState.errors.code?.message}
            registration={otpForm.register('code')}
            autoComplete='one-time-code'
            autoFocus
            label='Verification code'
            className='h-12 w-full rounded-lg border-gray-800 bg-gray-950/60 text-center tracking-[0.4em] text-white transition-all placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25'
          />

          <Button
            type='submit'
            disabled={otpForm.formState.isSubmitting || isSubmitting}
            className='flex h-12 w-full items-center justify-center gap-2 border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-base font-bold text-white shadow-lg shadow-cyan-950/40 transition-all hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isSubmitting ? 'Verifying...' : 'Verify'}
          </Button>

          <button
            type='button'
            onClick={handleResend}
            disabled={cooldown > 0 || isSubmitting}
            className='flex w-full items-center justify-center gap-2 py-2 text-center text-xs text-gray-400 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'
          >
            <RefreshCw className='h-3.5 w-3.5' />
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>

          <button
            type='button'
            onClick={() => {
              setStage('phone')
              setCooldown(0)
            }}
            className='w-full py-1 text-center text-xs text-gray-500 transition-colors hover:text-gray-300'
          >
            Use a different number
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title='Verify your phone'
      subtitle='We need to confirm your Pakistani WhatsApp number before you continue'
    >
      <form
        onSubmit={phoneForm.handleSubmit(onSubmitPhone)}
        className='space-y-6'
      >
        <Input
          id='phoneNumber'
          type='tel'
          placeholder='03XXXXXXXXX or +923XXXXXXXXX'
          error={phoneForm.formState.errors.phoneNumber?.message}
          registration={phoneForm.register('phoneNumber')}
          autoComplete='tel'
          autoFocus
          label='WhatsApp phone number'
          className='h-12 w-full rounded-lg border-gray-800 bg-gray-950/60 text-white transition-all placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25'
        />

        <Button
          type='submit'
          disabled={phoneForm.formState.isSubmitting || isSubmitting}
          className='flex h-12 w-full items-center justify-center gap-2 border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-base font-bold text-white shadow-lg shadow-cyan-950/40 transition-all hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isSubmitting ? 'Sending...' : 'Send verification code'}
        </Button>
      </form>
    </AuthLayout>
  )
}
