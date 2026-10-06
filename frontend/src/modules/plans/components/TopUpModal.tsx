import { useAuth } from '@/modules/auth/hooks/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Modal } from '@/shared/components/Modal'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useState } from 'react'
import { toast } from 'react-toastify'
import {
  OVERAGE_COST_PAISA_PER_SIGNAL,
  TOPUP_PACKS,
  type TopupPackId,
} from '../constants'
import { subscriptionService } from '../services'
import { formatPaisa } from '../utils'

interface TopUpModalProps {
  isOpen: boolean
  onClose: () => void
  /** Optional context line, e.g. why the modal opened. */
  reason?: string
}

export function TopUpModal({ isOpen, onClose, reason }: TopUpModalProps) {
  const { enablePaymentProcessor } = useAuth()
  const [pending, setPending] = useState<TopupPackId | null>(null)

  const handleSelect = async (packId: TopupPackId) => {
    if (pending) return
    setPending(packId)
    try {
      const { checkoutUrl } =
        await subscriptionService.createTopupCheckout(packId)
      window.location.href = checkoutUrl
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to start checkout'))
      setPending(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Top up credits'
      description={
        reason ??
        `Your monthly AI quota is used up. Each extra AI signal costs ${formatPaisa(OVERAGE_COST_PAISA_PER_SIGNAL)}.`
      }
    >
      {!enablePaymentProcessor ? (
        <p
          role='status'
          className='rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground'
        >
          Credit top-ups aren&apos;t available right now because online payments
          are turned off. Please contact your administrator.
        </p>
      ) : (
        <ul className='space-y-3'>
          {TOPUP_PACKS.map((pack) => (
            <li key={pack.id}>
              <Button
                type='button'
                variant='outline'
                className='h-auto w-full justify-between py-3'
                disabled={pending !== null}
                onClick={() => handleSelect(pack.id)}
              >
                <span className='text-left'>
                  <span className='block text-base font-semibold'>
                    {formatPaisa(pack.pricePaisa)}
                  </span>
                  <span className='block text-xs text-muted-foreground'>
                    ≈ {pack.signals} AI signals
                  </span>
                </span>
                <span className='text-sm'>
                  {pending === pack.id ? 'Redirecting…' : 'Buy'}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type='button'
        variant='ghost'
        className='mt-4 w-full'
        onClick={onClose}
      >
        Not now
      </Button>
    </Modal>
  )
}
