import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-toastify', () => ({ toast }))
const service = vi.hoisted(() => ({
  requestStepUp: vi.fn(),
  verifyStepUp: vi.fn(),
}))
vi.mock('../services', () => ({ adminService: service }))

import { ReasonModal } from './ReasonModal'

const REASON = 'Customer escalation #4821, approved'

const setup = (
  overrides: Partial<React.ComponentProps<typeof ReasonModal>> = {},
) => {
  const props = {
    title: 'Override plan',
    confirmLabel: 'Confirm',
    successMessage: 'Done',
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  }
  render(<ReasonModal {...props} />)
  return props
}

beforeEach(() => vi.clearAllMocks())

describe('ReasonModal', () => {
  it('keeps Confirm disabled until the reason is long enough', async () => {
    setup()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Reason (audited)'), 'too short')
    expect(confirm).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      ' but now it is long enough',
    )
    expect(confirm).toBeEnabled()
  })

  it('stays disabled while the extra fields are invalid', async () => {
    setup({ canSubmit: false })
    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('submits the trimmed reason, then reports success and closes', async () => {
    const props = setup()
    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      `  ${REASON}  `,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith(REASON, undefined),
    )
    expect(toast.success).toHaveBeenCalledWith('Done')
    expect(props.onDone).toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('sends the ticket along with the reason, normalised to upper case', async () => {
    const props = setup()
    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    await userEvent.type(screen.getByLabelText('Support ticket'), 'sup-1234')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith(REASON, 'SUP-1234'),
    )
  })

  it('blocks a malformed ticket but allows leaving it blank', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    await userEvent.type(
      screen.getByLabelText('Support ticket'),
      'not a ticket',
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('Support ticket'))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it('keeps Confirm disabled until a ticket is entered when one is required', async () => {
    setup({ ticketRequired: true })
    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Support ticket'), 'SUP-12')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it("shows the server's message and stays open when the action fails", async () => {
    const failure = {
      response: {
        data: { message: 'Deduction exceeds the current credit balance' },
      },
    }
    const props = setup({ onSubmit: vi.fn().mockRejectedValue(failure) })
    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Deduction exceeds the current credit balance',
      ),
    )
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })
})

describe('ReasonModal — step-up', () => {
  const stepUpRequired = {
    response: {
      data: {
        message: 'Verify your identity to continue',
        errorCode: 'STEP_UP_REQUIRED',
      },
    },
  }

  it('pauses for an identity check instead of failing, then retries the same action', async () => {
    service.verifyStepUp.mockResolvedValue(undefined)
    service.requestStepUp.mockResolvedValue(undefined)
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(stepUpRequired)
      .mockResolvedValueOnce(undefined)
    const props = setup({ onSubmit })

    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    // No error toast: the user is asked to verify instead.
    expect(await screen.findByText("Verify it's you")).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Email me a code' }),
    )
    await userEvent.type(
      await screen.findByLabelText('Verification code'),
      '482913',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit).toHaveBeenLastCalledWith(REASON, undefined)
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Done')
  })

  it('returns to the form with the reason intact when the identity check is cancelled', async () => {
    const onSubmit = vi.fn().mockRejectedValue(stepUpRequired)
    setup({ onSubmit })

    await userEvent.type(screen.getByLabelText('Reason (audited)'), REASON)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText("Verify it's you")
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByLabelText('Reason (audited)')).toHaveValue(REASON)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
