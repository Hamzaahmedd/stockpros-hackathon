import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { teamService } from '../services'
import type { JoinRequest } from '../types'
import { apiErrorMessage, formatDate } from '../utils'

interface JoinRequestsProps {
  /** Seat counts and the member list change when a request is approved. */
  onChanged: () => void
}

/** Colleagues on a verified domain asking to join, for an owner or admin to approve or decline. */
export function JoinRequests({ onChanged }: JoinRequestsProps) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRequests(await teamService.listJoinRequests())
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load join requests'))
      setRequests([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (
    request: JoinRequest,
    action: (id: string) => Promise<void>,
    success: string,
    failure: string,
  ) => {
    if (busyId) return
    setBusyId(request.id)
    try {
      await action(request.id)
      toast.success(success)
      await load()
      onChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err, failure))
    } finally {
      setBusyId(null)
    }
  }

  const approve = (request: JoinRequest) =>
    decide(
      request,
      teamService.approveJoinRequest,
      `${request.displayName} joined the workspace`,
      'Failed to approve request',
    )

  const decline = (request: JoinRequest) =>
    decide(
      request,
      teamService.declineJoinRequest,
      `Declined ${request.displayName}'s request`,
      'Failed to decline request',
    )

  if (requests === null) return null

  return (
    <section aria-labelledby='join-requests' className='space-y-2'>
      <h2
        id='join-requests'
        className='flex items-center gap-2 text-sm font-semibold'
      >
        Join requests
        {requests.length > 0 && (
          <Badge variant='secondary'>{requests.length}</Badge>
        )}
      </h2>
      {requests.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          No pending join requests.
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className='font-medium'>
                    {request.displayName}
                  </TableCell>
                  <TableCell>{request.email}</TableCell>
                  <TableCell>{formatDate(request.createdAt)}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Button
                        type='button'
                        size='sm'
                        disabled={busyId !== null}
                        aria-label={`Approve ${request.displayName}`}
                        onClick={() => void approve(request)}
                      >
                        Approve
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='text-red-500'
                        disabled={busyId !== null}
                        aria-label={`Decline ${request.displayName}`}
                        onClick={() => void decline(request)}
                      >
                        Decline
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
