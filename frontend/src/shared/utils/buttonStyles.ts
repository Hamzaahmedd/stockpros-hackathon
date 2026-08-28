// Shared classes for secondary action buttons: stronger light-mode contrast than
// the shadcn secondary/outline variants, with the existing dark treatment preserved.
export const SECONDARY_ACTION_BTN = [
  'border border-slate-400 bg-slate-200/80 text-slate-900',
  'transition-colors duration-200',
  'hover:border-slate-500 hover:bg-slate-300 active:bg-slate-400/50',
  'dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200',
  'dark:hover:border-cyan-500/50 dark:hover:bg-slate-800 dark:hover:text-white',
  'dark:active:bg-slate-800/70',
].join(' ')

// Muted icon color one step below the label text (light mode).
export const SECONDARY_ACTION_ICON_BTN = 'text-slate-700 dark:text-slate-200'
