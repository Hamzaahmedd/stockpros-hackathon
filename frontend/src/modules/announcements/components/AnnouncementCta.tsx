import { Link } from 'react-router-dom'
import { isInternalPath } from '../utils'

interface AnnouncementCtaProps {
  readonly label: string
  readonly url: string
  readonly className: string
  /** Runs when the link is followed (e.g. to dismiss the announcement). */
  readonly onFollow?: () => void
}

/** An in-app path is routed; an external https URL opens in a new tab without leaking the opener. */
export function AnnouncementCta({
  label,
  url,
  className,
  onFollow,
}: AnnouncementCtaProps) {
  if (isInternalPath(url)) {
    return (
      <Link to={url} className={className} onClick={onFollow}>
        {label}
      </Link>
    )
  }
  return (
    <a
      href={url}
      target='_blank'
      rel='noopener noreferrer'
      className={className}
      onClick={onFollow}
    >
      {label}
    </a>
  )
}
