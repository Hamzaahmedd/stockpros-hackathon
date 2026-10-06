import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
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
import { CREDIT_LEDGER_TYPES, UUID_PATTERN } from '../constants'
import { adminService } from '../services'
import type { AdminPage, CreditLedgerEntry, CreditLedgerType } from '../types'
import {
  apiErrorMessage,
  actionLabel,
  formatDateTime,
  formatPaisa,
} from '../utils'
import { Pager } from './Pager'

const validId = (value: string): boolean =>
  value === '' || UUID_PATTERN.test(value.trim())

/**
 * Credit-pool movements for billing disputes: top-ups, overage deductions,
 * refunds and manual adjustments. Product-usage analytics are not here (PostHog).
 */
export function CreditLedgerSection() {
  const [userId, setUserId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [type, setType] = useState<CreditLedgerType | ''>('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminPage<CreditLedgerEntry> | null>(
    null,
  )

  const load = useCallback(async () => {
    if (!validId(userId) || !validId(teamId)) return
    try {
      setResult(
        await adminService.listCreditLedger(
          {
            userId: userId.trim() || undefined,
            teamId: teamId.trim() || undefined,
            type: type || undefined,
          },
          page,
        ),
      )
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load the credit ledger'))
      setResult(
        (current) => current ?? { items: [], total: 0, page: 1, limit: 25 },
      )
    }
  }, [userId, teamId, type, page])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => setPage(1)

  return (
    <section aria-labelledby='ledger-heading' className='space-y-3'>
      <h2 id='ledger-heading' className='text-base font-semibold'>
        Credit ledger
      </h2>
      <div className='flex flex-wrap gap-2'>
        <Input
          aria-label='Ledger user ID'
          className='max-w-xs'
          placeholder='User ID'
          aria-invalid={!validId(userId)}
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value)
            reset()
          }}
        />
        <Input
          aria-label='Ledger team ID'
          className='max-w-xs'
          placeholder='Team ID'
          aria-invalid={!validId(teamId)}
          value={teamId}
          onChange={(event) => {
            setTeamId(event.target.value)
            reset()
          }}
        />
        <select
          aria-label='Ledger type'
          value={type}
          onChange={(event) => {
            setType(event.target.value as CreditLedgerType | '')
            reset()
          }}
          className='h-9 rounded-md border border-input bg-background px-3 text-sm'
        >
          <option value=''>All movements</option>
          {CREDIT_LEDGER_TYPES.map((value) => (
            <option key={value} value={value}>
              {actionLabel(value)}
            </option>
          ))}
        </select>
      </div>

      {result && result.items.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          No credit movements found.
        </p>
      )}
      {result && result.items.length > 0 && (
        <div className='overflow-x-auto rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>{actionLabel(entry.type)}</Badge>
                  </TableCell>
                  <TableCell>{formatPaisa(entry.amountPaisa)}</TableCell>
                  <TableCell className='font-mono text-[10px]'>
                    {entry.teamId
                      ? `team ${entry.teamId}`
                      : `user ${entry.userId ?? '—'}`}
                  </TableCell>
                  <TableCell className='max-w-xs whitespace-pre-wrap'>
                    {entry.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {result && <Pager result={result} onPage={setPage} />}
    </section>
  )
}
