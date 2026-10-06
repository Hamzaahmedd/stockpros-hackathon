/** Integer paisa as rupees for emails and UI copy, e.g. 749900 -> "Rs 7,499". */
export const formatAmount = (amountPaisa: number): string =>
  `Rs ${(amountPaisa / 100).toLocaleString('en-PK')}`

/** A calendar date in UTC, e.g. "Oct 6, 2026", so the host's time zone never shifts it. */
export const formatDateUtc = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
