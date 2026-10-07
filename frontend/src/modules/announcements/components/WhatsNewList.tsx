import { FiGift } from 'react-icons/fi'
import { useAnnouncements } from '../hooks/useAnnouncements'
import type { Announcement } from '../types'
import { AnnouncementCta } from './AnnouncementCta'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

function WhatsNewItem({
  item,
  onOpen,
}: {
  readonly item: Announcement
  readonly onOpen: () => void
}) {
  const { markSeen } = useAnnouncements()

  return (
    <li
      className={`relative p-5 ${item.unread ? 'bg-cyan-500/[0.04]' : ''}`}
      data-unread={item.unread}
    >
      {item.unread && (
        <span
          aria-label='Unread'
          className='absolute left-2 top-6 h-2 w-2 rounded-full bg-cyan-500'
        />
      )}
      <div className='flex items-baseline justify-between gap-3'>
        <h4 className='text-sm font-bold text-gray-900 dark:text-white'>
          {item.title}
        </h4>
        <time
          dateTime={item.publishedAt}
          className='shrink-0 text-[10px] font-semibold uppercase tracking-widest text-gray-400'
        >
          {formatDate(item.publishedAt)}
        </time>
      </div>
      <p className='mt-1 whitespace-pre-wrap break-words text-sm text-gray-500 dark:text-gray-400'>
        {item.body}
      </p>
      <div className='mt-2 flex items-center gap-4'>
        {item.ctaLabel && item.ctaUrl && (
          <AnnouncementCta
            label={item.ctaLabel}
            url={item.ctaUrl}
            className='text-xs font-bold text-cyan-700 hover:underline dark:text-cyan-400'
            onFollow={() => {
              void markSeen(item.id)
              onOpen()
            }}
          />
        )}
        {item.unread && (
          <button
            type='button'
            onClick={() => void markSeen(item.id)}
            className='text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          >
            Mark as read
          </button>
        )}
      </div>
    </li>
  )
}

/** The "What's new" history inside the notification bell. Dismissed popups stay listed here, marked read. */
export function WhatsNewList({ onOpen }: { readonly onOpen: () => void }) {
  const { boot } = useAnnouncements()
  const items = boot?.changelog.items ?? []

  if (items.length === 0) {
    return (
      <div className='p-24 text-center'>
        <FiGift className='mx-auto mb-6 text-6xl text-gray-300 opacity-40 dark:text-gray-800' />
        <p className='text-sm font-black uppercase tracking-widest text-gray-400 dark:text-gray-500'>
          Nothing new yet
        </p>
      </div>
    )
  }

  return (
    <ul className='divide-y divide-gray-100 dark:divide-white/[0.03]'>
      {items.map((item) => (
        <WhatsNewItem key={item.id} item={item} onOpen={onOpen} />
      ))}
    </ul>
  )
}
