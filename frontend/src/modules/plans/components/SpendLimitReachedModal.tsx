import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Link } from 'react-router-dom'

interface SpendLimitReachedModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly message: string
}

/** Shown when a user's own monthly spending limit stops an AI signal: the fix is raising the limit, not buying credit. */
export function SpendLimitReachedModal({
  isOpen,
  onClose,
  message,
}: SpendLimitReachedModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Spending limit reached'
      description={`${message} Raise it to keep using paid AI signals, or wait for your next billing cycle.`}
    >
      <div className='flex flex-col gap-2'>
        <Button asChild>
          <Link to='/usage' onClick={onClose}>
            Review your limit
          </Link>
        </Button>
        <Button type='button' variant='ghost' onClick={onClose}>
          Not now
        </Button>
      </div>
    </Modal>
  )
}
