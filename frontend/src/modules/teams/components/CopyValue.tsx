import { Button } from '@/shared/components/ui/button'
import { Copy } from 'lucide-react'
import { toast } from 'react-toastify'

interface CopyValueProps {
  label: string
  value: string
}

/** A read-only value (an address to paste into another system) with a copy button. */
export function CopyValue({ label, value }: Readonly<CopyValueProps>) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Could not copy the ${label}. Select it and copy manually.`)
    }
  }

  return (
    <div>
      <p className='mb-1 text-xs font-medium text-muted-foreground'>{label}</p>
      <div className='flex items-center gap-2'>
        <code
          data-testid={`value-${label}`}
          className='min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs'
        >
          {value}
        </code>
        <Button
          type='button'
          size='sm'
          variant='outline'
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
        >
          <Copy className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}
