import { Button } from '@/shared/components/ui/button'
import type { AdminPage } from '../types'

interface Props {
  /** The page the server last returned; the pager renders nothing for a single page. */
  result: Pick<AdminPage<unknown>, 'page' | 'total' | 'limit'>
  onPage: (page: number) => void
}

/** Previous/Next controls shared by every paginated admin table. */
export function Pager({ result, onPage }: Readonly<Props>) {
  if (result.total <= result.limit) return null

  return (
    <div className='flex items-center gap-2'>
      <Button
        size='sm'
        variant='ghost'
        disabled={result.page <= 1}
        onClick={() => onPage(result.page - 1)}
      >
        Previous
      </Button>
      <span className='text-xs text-muted-foreground'>
        Page {result.page} of {Math.ceil(result.total / result.limit)}
      </span>
      <Button
        size='sm'
        variant='ghost'
        disabled={result.page * result.limit >= result.total}
        onClick={() => onPage(result.page + 1)}
      >
        Next
      </Button>
    </div>
  )
}
