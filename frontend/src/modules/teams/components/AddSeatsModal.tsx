import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Modal } from '@/shared/components/Modal'
import {
  TEAM_MAX_SEATS,
  TEAM_SEAT_PRICE_PAISA,
} from '@/modules/plans/constants'
import { clampSeats, formatPaisa } from '@/modules/plans/utils'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { teamService } from '../services'
import { apiErrorMessage } from '../utils'

interface AddSeatsModalProps {
  isOpen: boolean
  onClose: () => void
  currentCapacity: number
  /** Called after seats were added instantly (Bypass Mode). */
  onAdded: () => void
}

export function AddSeatsModal({
  isOpen,
  onClose,
  currentCapacity,
  onAdded,
}: AddSeatsModalProps) {
  const maxAddable = Math.max(TEAM_MAX_SEATS - currentCapacity, 0)
  const [seats, setSeats] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const count = clampSeats(seats, 1, Math.max(maxAddable, 1))
  const totalPaisa = count * TEAM_SEAT_PRICE_PAISA

  const handleSubmit = async () => {
    if (submitting || maxAddable === 0) return
    setSubmitting(true)
    try {
      const result = await teamService.addSeats(count)
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }
      toast.success(`Added ${count} seat${count === 1 ? '' : 's'}`)
      onAdded()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to add seats'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Add seats'
      description={`You have ${currentCapacity} seats. A workspace can have up to ${TEAM_MAX_SEATS}.`}
    >
      <label htmlFor='add-seats-count' className='text-sm font-medium'>
        Seats to add
      </label>
      <Input
        id='add-seats-count'
        type='number'
        min={1}
        max={maxAddable}
        value={seats}
        disabled={maxAddable === 0}
        onChange={(e) => setSeats(Number(e.target.value))}
        className='mt-1'
      />
      <div className='mt-4 rounded-lg bg-muted/50 p-3 text-sm'>
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>
            {count} × {formatPaisa(TEAM_SEAT_PRICE_PAISA)}
          </span>
          <span className='font-semibold'>{formatPaisa(totalPaisa)}</span>
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          New seats are active as soon as payment is confirmed.
        </p>
      </div>
      {maxAddable === 0 && (
        <p className='mt-2 text-sm text-amber-500'>
          This workspace is already at the {TEAM_MAX_SEATS}-seat maximum.
        </p>
      )}
      <div className='mt-5 flex gap-3'>
        <Button
          type='button'
          variant='outline'
          className='flex-1'
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type='button'
          className='flex-1'
          disabled={submitting || maxAddable === 0}
          onClick={handleSubmit}
        >
          {submitting ? 'Working…' : `Pay ${formatPaisa(totalPaisa)}`}
        </Button>
      </div>
    </Modal>
  )
}
