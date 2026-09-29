import z from 'zod'
import { validateOrThrow, ValidationError } from '../validation-error'

describe('validateOrThrow', () => {
  it('returns the parsed data when validation succeeds', () => {
    const schema = z.object({ name: z.string() })
    expect(validateOrThrow(schema, { name: 'AAPL' })).toEqual({
      name: 'AAPL',
    })
  })

  it('throws a ValidationError joining field errors when validation fails', () => {
    const schema = z.object({ name: z.string() })
    expect(() => validateOrThrow(schema, { name: 123 })).toThrow(
      ValidationError,
    )
    try {
      validateOrThrow(schema, { name: 123 })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).message).toContain('Validation failed:')
      expect((err as ValidationError).details).toBeDefined()
    }
  })

  it('joins a top-level (form-level) refine error into the message', () => {
    const schema = z.object({}).refine(() => false, { message: 'form is bad' })
    expect(() => validateOrThrow(schema, {})).toThrow(
      'Validation failed: form is bad',
    )
  })
})
