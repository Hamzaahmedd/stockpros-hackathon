import { useAuth } from '@/modules/auth/hooks/useAuth'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Sidebar } from '@/shared/components/Sidebar'
import { FiCheckCircle, FiClock, FiXCircle } from 'react-icons/fi'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { subscriptionService } from '../services'

type ResultState = 'checking' | 'completed' | 'pending' | 'failed'

export default function PaymentResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshMe } = useAuth()
  const [state, setState] = useState<ResultState>('checking')

  const trackerId = searchParams.get('tracker_id')

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!trackerId) {
        setState('failed')
        return
      }

      try {
        const { status } = await subscriptionService.verifyTracker(trackerId)
        if (cancelled) return

        if (status === 'COMPLETED') {
          await refreshMe()
          setState('completed')
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          setState('failed')
        } else {
          // Webhook may not have landed yet — the transaction stays PENDING
          // briefly after the browser redirect. One retry after a short
          // delay is enough for the common case without polling forever.
          setTimeout(async () => {
            if (cancelled) return
            const { status: retryStatus } =
              await subscriptionService.verifyTracker(trackerId)
            if (cancelled) return
            if (retryStatus === 'COMPLETED') {
              await refreshMe()
              setState('completed')
            } else if (
              retryStatus === 'FAILED' ||
              retryStatus === 'CANCELLED'
            ) {
              setState('failed')
            } else {
              setState('pending')
            }
          }, 3000)
        }
      } catch {
        if (!cancelled) setState('failed')
      }
    }

    check()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerId])

  const content = {
    checking: {
      icon: <FiClock className='text-4xl text-muted-foreground' />,
      title: 'Confirming your payment...',
      message: 'This should only take a moment.',
    },
    completed: {
      icon: <FiCheckCircle className='text-4xl text-primary' />,
      title: 'Welcome to Pro!',
      message: 'Your payment was confirmed and your account has been upgraded.',
    },
    pending: {
      icon: <FiClock className='text-4xl text-muted-foreground' />,
      title: 'Payment pending',
      message:
        "We're still waiting for confirmation from Safepay. This page will update automatically once it lands.",
    },
    failed: {
      icon: <FiXCircle className='text-4xl text-destructive' />,
      title: 'Payment not completed',
      message:
        'Your payment was cancelled or could not be confirmed. No charge was applied.',
    },
  }[state]

  return (
    <div className='flex h-screen overflow-hidden bg-background text-foreground'>
      <Sidebar />
      <main className='flex flex-1 items-center justify-center overflow-y-auto p-4'>
        <Card className='w-full max-w-md text-center'>
          <CardHeader className='flex flex-col items-center gap-4'>
            {content.icon}
            <CardTitle>{content.title}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            <p className='text-sm text-muted-foreground'>{content.message}</p>
            <div className='flex justify-center gap-3'>
              {state === 'failed' && (
                <Button variant='outline' onClick={() => navigate('/plans')}>
                  Back to plans
                </Button>
              )}
              {(state === 'completed' || state === 'pending') && (
                <Button onClick={() => navigate('/dashboard')}>
                  Go to dashboard
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
