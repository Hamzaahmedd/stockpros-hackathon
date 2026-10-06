import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('../services', () => ({ feedbackService: service }))

import { FeedbackWidget } from './FeedbackWidget'

const open = async () => {
  render(
    <MemoryRouter initialEntries={['/forecast']}>
      <FeedbackWidget />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByTitle('Send feedback'))
}

const write = (text: string) =>
  userEvent.type(screen.getByPlaceholderText(/on your mind/), text)

// The sidebar trigger shares this name through its title, so pick the button by its text.
const submitButton = () =>
  screen.getByText('Send feedback', { selector: 'button' })
const send = () => userEvent.click(submitButton())

beforeEach(() => {
  vi.clearAllMocks()
  service.submit.mockResolvedValue({ id: 'f1' })
})

describe('FeedbackWidget', () => {
  it('offers the three categories, none chosen, and says what it collects', async () => {
    await open()

    const group = screen.getByRole('radiogroup', {
      name: 'What is this about?',
    })
    const options = group.querySelectorAll('[role="radio"]')
    expect([...options].map((option) => option.textContent)).toEqual([
      'Bug',
      'Feature request',
      'General',
    ])
    expect(
      [...options].every(
        (option) => option.getAttribute('aria-checked') === 'false',
      ),
    ).toBe(true)
    expect(
      screen.getByText(
        'We include your browser and screen size to help us debug.',
      ),
    ).toBeInTheDocument()
  })

  it('sends the category, the page and the browser context', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'Bug' }))
    await write('The chart is blank')
    await send()

    await waitFor(() => expect(service.submit).toHaveBeenCalledTimes(1))
    const input = service.submit.mock.calls[0][0]
    expect(input).toMatchObject({
      message: 'The chart is blank',
      page: '/forecast',
      category: 'BUG',
    })
    expect(input.metadata).toMatchObject({
      appVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
      viewport: { width: expect.any(Number), height: expect.any(Number) },
      userAgent: expect.any(String),
    })
    // The plan is the server's to read from the session.
    expect(input.metadata).not.toHaveProperty('planTier')
    expect(
      await screen.findByText('Thanks for the feedback!'),
    ).toBeInTheDocument()
  })

  it('leaves the category out when none was chosen, and lets a choice be undone', async () => {
    await open()
    const bug = screen.getByRole('radio', { name: 'Bug' })
    await userEvent.click(bug)
    expect(bug).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(bug)
    expect(bug).toHaveAttribute('aria-checked', 'false')

    await write('Just a note')
    await send()

    await waitFor(() => expect(service.submit).toHaveBeenCalledTimes(1))
    expect(service.submit.mock.calls[0][0]).not.toHaveProperty('category')
  })

  it('switches between categories', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'Bug' }))
    await userEvent.click(
      screen.getByRole('radio', { name: 'Feature request' }),
    )
    expect(screen.getByRole('radio', { name: 'Bug' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(
      screen.getByRole('radio', { name: 'Feature request' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('does not send an empty message', async () => {
    await open()
    expect(submitButton()).toBeDisabled()
    expect(service.submit).not.toHaveBeenCalled()
  })

  it('shows the server message when sending fails, and keeps what was typed', async () => {
    service.submit.mockRejectedValue({
      response: { data: { message: 'You are sending feedback too quickly.' } },
    })
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'General' }))
    await write('hello')
    await send()

    expect(
      await screen.findByText('You are sending feedback too quickly.'),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/on your mind/)).toHaveValue('hello')
    expect(screen.getByRole('radio', { name: 'General' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('starts fresh the next time it is opened', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'Bug' }))
    await write('draft')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByTitle('Send feedback'))
    expect(screen.getByPlaceholderText(/on your mind/)).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Bug' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})
