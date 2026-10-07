interface DateFieldProps {
  /** Visible caption, also the accessible name of the input (e.g. "From"). */
  label: string
  /** ISO date (YYYY-MM-DD). */
  value: string
  /** Latest selectable ISO date. */
  max: string
  onChange: (value: string) => void
}

/**
 * A labelled date input styled as a compact chip. The native input is a real,
 * keyboard-focusable control laid over the chip, so it is announced with its
 * label and can be typed into or opened with the picker (no button nesting).
 */
export function DateField({ label, value, max, onChange }: DateFieldProps) {
  return (
    <label className='date-field-btn group relative flex cursor-pointer flex-col gap-0.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 transition-all focus-within:ring-2 focus-within:ring-ring hover:bg-primary/10'>
      <span className='text-[9px] font-black uppercase tracking-widest text-primary'>
        {label}
      </span>
      <span className='text-xs font-bold text-foreground'>{value}</span>
      <input
        type='date'
        aria-label={`${label} date`}
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
      />
    </label>
  )
}
