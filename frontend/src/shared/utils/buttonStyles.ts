// Shared Tailwind classes for "secondary action" buttons (e.g. Download Report,
// View analysis, Permissions, Logout). These need stronger light-mode affordance
// than the shadcn `secondary`/`outline` variants (which resolve to a near-white
// `--secondary` surface), while keeping the existing dark surface untouched.
//
// Light: distinct slate surface + defined border + high-contrast text.
// Dark : the exact slate-800/50 + cyan hover treatment used across the app.
export const SECONDARY_ACTION_BTN = [
  'border border-slate-400 bg-slate-200/80 text-slate-900',
  'transition-colors duration-200',
  'hover:border-slate-500 hover:bg-slate-300 active:bg-slate-400/50',
  'dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200',
  'dark:hover:border-cyan-500/50 dark:hover:bg-slate-800 dark:hover:text-white',
  'dark:active:bg-slate-800/70',
].join(' ')

// Compact secondary-action buttons carry a muted icon one step below the label
// text in light mode, while preserving the inherited light surface in dark mode.
export const SECONDARY_ACTION_ICON_BTN = 'text-slate-700 dark:text-slate-200'
