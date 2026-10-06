import { Button } from '@/shared/components/ui/button'
import { useEffect, useState } from 'react'
import { REVEAL_VISIBLE_MS } from '../constants'
import { adminService } from '../services'
import type { RevealedUser } from '../types'
import { ReasonModal } from './ReasonModal'

interface Props {
  userId: string
  displayName: string | null
  email: string
  /** True when the API masked the values above. */
  masked?: boolean
}

/**
 * A customer's name and email. When the API masked them, staff can reveal the
 * real values (audited, with a reason and ticket); they hide again after a
 * minute so a screen left open does not keep showing personal data.
 */
export function CustomerIdentity({
  userId,
  displayName,
  email,
  masked = false,
}: Readonly<Props>) {
  const [revealed, setRevealed] = useState<RevealedUser | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!revealed) return
    const timer = setTimeout(() => setRevealed(null), REVEAL_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [revealed])

  const shown = revealed ?? { displayName, email, phoneNumber: null }

  return (
    <div>
      <div className='font-medium'>{shown.displayName ?? '—'}</div>
      <div className='text-xs text-muted-foreground'>{shown.email}</div>
      {revealed?.phoneNumber && (
        <div className='text-xs text-muted-foreground'>
          {revealed.phoneNumber}
        </div>
      )}
      {masked && (
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className='mt-1 h-6 px-1 text-xs'
          onClick={() => (revealed ? setRevealed(null) : setAsking(true))}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </Button>
      )}

      {asking && (
        <ReasonModal
          title='Reveal customer details'
          description="Shows this customer's real name, email and phone for one minute. The reveal is recorded in the audit log."
          confirmLabel='Reveal'
          successMessage='Customer details revealed'
          onSubmit={async (reason, ticketRef) => {
            setRevealed(
              await adminService.revealUser(userId, reason, ticketRef),
            )
          }}
          onClose={() => setAsking(false)}
          onDone={() => undefined}
        />
      )}
    </div>
  )
}
