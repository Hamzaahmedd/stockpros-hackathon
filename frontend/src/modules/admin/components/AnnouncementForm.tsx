import {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  AnnouncementTeamRole,
} from '@/modules/announcements'
import { Input } from '@/shared/components/ui/input'
import type { ReactNode } from 'react'
import {
  MUST_BE_DISMISSIBLE,
  togglePlan,
  toggleRole,
  type AnnouncementDraft,
} from '../announcement-form'
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CTA_LABEL_MAX,
  ANNOUNCEMENT_PRIORITY_MAX,
  ANNOUNCEMENT_PRIORITY_MIN,
  ANNOUNCEMENT_TITLE_MAX,
} from '../constants'
import { PLACEMENT_LABELS, PLAN_LABELS } from '../announcement-labels'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

function Field({
  id,
  label,
  hint,
  children,
}: Readonly<{
  id: string
  label: string
  hint?: string
  children: ReactNode
}>) {
  return (
    <div>
      <label htmlFor={id} className='mb-1 block text-sm font-medium'>
        {label}
      </label>
      {children}
      {hint && <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>}
    </div>
  )
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: Readonly<{
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}>) {
  return (
    <label className='flex items-center gap-2 text-sm'>
      <input
        type='checkbox'
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  )
}

interface Props {
  draft: AnnouncementDraft
  onChange: (draft: AnnouncementDraft) => void
}

/** The announcement fields. Only the controls the chosen placement uses are shown. */
export function AnnouncementForm({ draft, onChange }: Readonly<Props>) {
  const set = <K extends keyof AnnouncementDraft>(
    key: K,
    value: AnnouncementDraft[K],
  ) => onChange({ ...draft, [key]: value })

  const { placement } = draft
  const mustBeDismissible = MUST_BE_DISMISSIBLE.includes(placement)

  return (
    <div className='space-y-4'>
      <Field id='ann-title' label='Title'>
        <Input
          id='ann-title'
          value={draft.title}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          onChange={(event) => set('title', event.target.value)}
        />
      </Field>

      <Field
        id='ann-body'
        label='Message'
        hint={`Plain text, up to ${ANNOUNCEMENT_BODY_MAX} characters. Shown as text, never as HTML.`}
      >
        <textarea
          id='ann-body'
          value={draft.body}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          rows={4}
          onChange={(event) => set('body', event.target.value)}
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
        />
      </Field>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field id='ann-placement' label='Where it appears'>
          <select
            id='ann-placement'
            value={placement}
            onChange={(event) => {
              const next = event.target.value as AnnouncementPlacement
              onChange({
                ...draft,
                placement: next,
                // A popup must stay closable; changing to one repairs the flag.
                dismissible: MUST_BE_DISMISSIBLE.includes(next)
                  ? true
                  : draft.dismissible,
                inChangelog:
                  next === AnnouncementPlacement.CHANGELOG
                    ? true
                    : draft.inChangelog,
              })
            }}
            className={SELECT_CLASS}
          >
            {Object.values(AnnouncementPlacement).map((value) => (
              <option key={value} value={value}>
                {PLACEMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        {placement === AnnouncementPlacement.BANNER && (
          <Field id='ann-severity' label='Severity'>
            <select
              id='ann-severity'
              value={draft.severity}
              onChange={(event) =>
                set('severity', event.target.value as AnnouncementSeverity | '')
              }
              className={SELECT_CLASS}
            >
              <option value=''>Choose…</option>
              {Object.values(AnnouncementSeverity).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        )}

        {placement === AnnouncementPlacement.SPOTLIGHT && (
          <Field id='ann-anchor' label='Points at'>
            <select
              id='ann-anchor'
              value={draft.anchor}
              onChange={(event) =>
                set('anchor', event.target.value as AnnouncementAnchor | '')
              }
              className={SELECT_CLASS}
            >
              <option value=''>Choose…</option>
              {Object.values(AnnouncementAnchor).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        )}

        {placement === AnnouncementPlacement.BADGE && (
          <Field id='ann-navkey' label='Menu entry'>
            <select
              id='ann-navkey'
              value={draft.navKey}
              onChange={(event) =>
                set('navKey', event.target.value as AnnouncementNavKey | '')
              }
              className={SELECT_CLASS}
            >
              <option value=''>Choose…</option>
              {Object.values(AnnouncementNavKey).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field
          id='ann-cta-label'
          label='Button label (optional)'
          hint='Needs a link too.'
        >
          <Input
            id='ann-cta-label'
            value={draft.ctaLabel}
            maxLength={ANNOUNCEMENT_CTA_LABEL_MAX}
            onChange={(event) => set('ctaLabel', event.target.value)}
          />
        </Field>
        <Field
          id='ann-cta-url'
          label='Button link (optional)'
          hint='An in-app path like /plans, or an https URL.'
        >
          <Input
            id='ann-cta-url'
            value={draft.ctaUrl}
            placeholder='/plans'
            onChange={(event) => set('ctaUrl', event.target.value)}
          />
        </Field>
      </div>

      <Field id='ann-image' label='Image (optional)' hint='https only.'>
        <Input
          id='ann-image'
          value={draft.imageUrl}
          onChange={(event) => set('imageUrl', event.target.value)}
        />
      </Field>

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>Plans</legend>
        <div className='flex flex-wrap gap-4'>
          {Object.values(AnnouncementPlanTarget).map((plan) => (
            <Check
              key={plan}
              label={PLAN_LABELS[plan]}
              checked={draft.targetPlans.includes(plan)}
              onChange={() =>
                set('targetPlans', togglePlan(draft.targetPlans, plan))
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>Workspace role</legend>
        <div className='flex flex-wrap gap-4'>
          {Object.values(AnnouncementTeamRole).map((role) => (
            <Check
              key={role}
              label={role}
              checked={draft.targetRoles.includes(role)}
              onChange={() =>
                set('targetRoles', toggleRole(draft.targetRoles, role))
              }
            />
          ))}
        </div>
        <p className='text-xs text-muted-foreground'>
          None ticked means every role. Solo accounts count as OWNER.
        </p>
      </fieldset>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field id='ann-starts' label='Starts (optional)'>
          <Input
            id='ann-starts'
            type='datetime-local'
            value={draft.startsAt}
            onChange={(event) => set('startsAt', event.target.value)}
          />
        </Field>
        <Field
          id='ann-ends'
          label='Ends (optional)'
          hint='Times are in your local time zone.'
        >
          <Input
            id='ann-ends'
            type='datetime-local'
            value={draft.endsAt}
            onChange={(event) => set('endsAt', event.target.value)}
          />
        </Field>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field
          id='ann-priority'
          label='Priority'
          hint='Higher wins when several compete for one spot.'
        >
          <Input
            id='ann-priority'
            type='number'
            min={ANNOUNCEMENT_PRIORITY_MIN}
            max={ANNOUNCEMENT_PRIORITY_MAX}
            value={draft.priority}
            onChange={(event) => set('priority', Number(event.target.value))}
          />
        </Field>
        <div className='space-y-2 pt-6'>
          <Check
            label='Users can dismiss it'
            checked={draft.dismissible}
            disabled={mustBeDismissible}
            onChange={() => set('dismissible', !draft.dismissible)}
          />
          <Check
            label='List it in the changelog'
            checked={draft.inChangelog}
            disabled={placement === AnnouncementPlacement.CHANGELOG}
            onChange={() => set('inChangelog', !draft.inChangelog)}
          />
        </div>
      </div>
    </div>
  )
}
