import { useOrgContext } from '@/shared/utils/org-context-store'
import { useState } from 'react'
import { FiBriefcase, FiChevronDown, FiChevronUp } from 'react-icons/fi'

const COLLAPSED_CHARS = 240

/**
 * Shows the workspace's AI instructions on the pages that produce forecasts and
 * decisions, so team members can read the guidance their admins set alongside
 * the output it applies to. Renders nothing for non-team users.
 */
export function OrgContextBanner() {
  const orgContext = useOrgContext()
  const [expanded, setExpanded] = useState(false)

  if (!orgContext) return null

  const long = orgContext.length > COLLAPSED_CHARS
  const text =
    long && !expanded
      ? `${orgContext.slice(0, COLLAPSED_CHARS).trimEnd()}…`
      : orgContext

  return (
    <aside
      aria-label='Workspace guidance'
      className='rounded-lg border border-primary/30 bg-primary/5 p-4'
    >
      <div className='flex items-start gap-3'>
        <FiBriefcase className='mt-0.5 shrink-0 text-primary' aria-hidden />
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-bold uppercase tracking-widest text-primary'>
            Workspace guidance
          </p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm text-foreground'>
            {text}
          </p>
          {long && (
            <button
              type='button'
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className='mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline'
            >
              {expanded ? (
                <>
                  Show less <FiChevronUp aria-hidden />
                </>
              ) : (
                <>
                  Show more <FiChevronDown aria-hidden />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
