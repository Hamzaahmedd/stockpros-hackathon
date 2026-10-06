import type { SeatUtilization } from '../types'

/** Seat utilisation bar, e.g. "8 / 10 seats" with pending invites shown as a lighter segment. */
export function SeatGauge({ seats }: { seats: SeatUtilization }) {
  const pct = (value: number) =>
    seats.capacity > 0 ? Math.min(100, (value / seats.capacity) * 100) : 0
  const used = seats.active + seats.pendingInvites

  return (
    <div>
      <div className='flex items-baseline justify-between'>
        <p className='text-2xl font-bold'>
          {seats.active}
          <span className='font-normal text-muted-foreground'>
            {' '}
            / {seats.capacity}
          </span>
        </p>
        <p className='text-sm text-muted-foreground'>
          {seats.available} available
          {seats.pendingInvites > 0 && ` · ${seats.pendingInvites} pending`}
        </p>
      </div>
      <div
        role='meter'
        aria-label='Seat utilization'
        aria-valuemin={0}
        aria-valuemax={seats.capacity}
        aria-valuenow={seats.active}
        className='mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted'
      >
        <div
          className='bg-primary'
          style={{ width: `${pct(seats.active)}%` }}
        />
        <div
          className='bg-primary/40'
          style={{ width: `${pct(seats.pendingInvites)}%` }}
        />
      </div>
      {used >= seats.capacity && (
        <p className='mt-2 text-xs text-amber-500'>
          All seats are in use — add seats to invite more people.
        </p>
      )}
    </div>
  )
}
