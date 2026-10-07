import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { listSessions, revokeOtherSessions, revokeSession } from '../services'
import type { ActiveSession } from '../types'

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** The devices signed in to this account, with per-device and sign-out-everywhere-else revocation. */
export function ActiveSessionsPanel() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSessions(await listSessions())
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your active sessions"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleRevoke = async (id: string) => {
    setBusyId(id)
    try {
      await revokeSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Session revoked')
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't revoke that session"))
    } finally {
      setBusyId(null)
    }
  }

  const handleRevokeOthers = async () => {
    setRevokingOthers(true)
    try {
      await revokeOtherSessions()
      setSessions((prev) => prev.filter((s) => s.isCurrent))
      toast.success('Signed out of all other sessions')
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't sign out other sessions"))
    } finally {
      setRevokingOthers(false)
    }
  }

  if (loading) return <Skeleton className='h-32 w-full' />

  if (error) {
    return (
      <div role='alert' className='space-y-3'>
        <p className='text-sm text-red-500'>{error}</p>
        <Button type='button' variant='outline' size='sm' onClick={load}>
          Try again
        </Button>
      </div>
    )
  }

  const hasOthers = sessions.some((s) => !s.isCurrent)

  return (
    <div className='space-y-4'>
      <div className='overflow-x-auto rounded-lg border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className='text-right'>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className='whitespace-nowrap'>
                  {session.device}
                  {session.isCurrent && (
                    <Badge variant='secondary' className='ml-2'>
                      Current
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{session.location ?? 'Unknown'}</TableCell>
                <TableCell className='whitespace-nowrap'>
                  {formatWhen(session.createdAt)}
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {formatWhen(session.updatedAt)}
                </TableCell>
                <TableCell className='text-right'>
                  {!session.isCurrent && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={busyId === session.id}
                      onClick={() => handleRevoke(session.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasOthers && (
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={revokingOthers}
          onClick={handleRevokeOthers}
        >
          Sign out of all other sessions
        </Button>
      )}
    </div>
  )
}
