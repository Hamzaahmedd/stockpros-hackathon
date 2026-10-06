import {
  AnnouncementPlacement,
  AnnouncementSeverity,
  SEVERITY_STYLES,
} from '@/modules/announcements'
import type { AnnouncementDraft } from '../announcement-form'

const CTA_CLASS =
  'inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground'

const text = (value: string, fallback: string): string =>
  value.trim() === '' ? fallback : value

/**
 * An inert mock of how the announcement will look. It is a sketch to catch bad
 * copy and the wrong placement, not a pixel-exact render: the live components
 * are fixed to the page and portalled, so they cannot be shown inside a form.
 */
export function AnnouncementPreview({
  draft,
}: Readonly<{ draft: AnnouncementDraft }>) {
  const title = text(draft.title, 'Your title')
  const body = text(draft.body, 'Your message appears here.')
  const hasCta = draft.ctaLabel.trim() !== '' && draft.ctaUrl.trim() !== ''
  const cta = hasCta ? (
    <span className={CTA_CLASS}>{draft.ctaLabel.trim()}</span>
  ) : null

  return (
    <figure
      aria-label='Preview'
      className='rounded-lg border border-dashed border-border bg-muted/30 p-4'
    >
      <figcaption className='mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
        Preview · {draft.placement.toLowerCase()}
      </figcaption>

      {draft.placement === AnnouncementPlacement.BANNER && (
        <div
          className={`flex items-center gap-3 rounded border px-3 py-2 text-sm ${
            SEVERITY_STYLES[draft.severity || AnnouncementSeverity.INFO]
          }`}
        >
          <p className='min-w-0 flex-1 break-words'>
            <span className='font-semibold'>{title}</span>
            <span className='ml-2'>{body}</span>
          </p>
          {hasCta && (
            <span className='shrink-0 font-semibold underline'>
              {draft.ctaLabel.trim()}
            </span>
          )}
        </div>
      )}

      {draft.placement === AnnouncementPlacement.BADGE && (
        <div className='flex items-center gap-3 rounded-md bg-secondary px-3 py-2 text-sm'>
          <span className='font-medium'>
            {draft.navKey ? draft.navKey.toLowerCase() : 'Menu entry'}
          </span>
          <span className='ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground'>
            New
          </span>
        </div>
      )}

      {draft.placement === AnnouncementPlacement.SPOTLIGHT && (
        <div className='w-72 rounded-xl border border-border bg-card p-4 text-card-foreground shadow'>
          <p className='text-sm font-semibold'>{title}</p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground'>
            {body}
          </p>
          <div className='mt-3 flex justify-end'>{cta}</div>
          <p className='mt-2 text-[10px] uppercase tracking-widest text-muted-foreground'>
            Points at: {draft.anchor || 'choose a target'}
          </p>
        </div>
      )}

      {(draft.placement === AnnouncementPlacement.MODAL ||
        draft.placement === AnnouncementPlacement.CHANGELOG) && (
        <div className='rounded-xl border border-border bg-card p-4 text-card-foreground shadow'>
          {draft.imageUrl.trim() !== '' && (
            <p className='mb-3 rounded bg-muted px-2 py-6 text-center text-xs text-muted-foreground'>
              Image
            </p>
          )}
          <p className='text-base font-semibold'>{title}</p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground'>
            {body}
          </p>
          <div className='mt-4 flex justify-end gap-2'>
            {draft.placement === AnnouncementPlacement.MODAL && (
              <span className='inline-flex h-8 items-center rounded-md border border-border px-3 text-xs'>
                Got it
              </span>
            )}
            {cta}
          </div>
        </div>
      )}
    </figure>
  )
}
