import { z } from 'zod'

export const emailValidator = z.object({
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email must be a string',
    })
    .email({ message: 'Invalid email format' })
    .trim()
    .toLowerCase(),
})

export const googleLoginValidator = z.object({
  credential: z
    .string({
      required_error: 'Google credential is required',
      invalid_type_error: 'Google credential must be a string',
    })
    .min(1, 'Google credential is required'),
})

export const magicLinkTokenValidator = z.object({
  token: z
    .string({
      required_error: 'Token is required',
      invalid_type_error: 'Token must be a string',
    })
    .min(1, 'Token is required'),
})

export const completeOnboardingValidator = z.object({
  onboardingToken: z.string().min(1).optional(),
  displayName: z
    .string({ required_error: 'Display name is required' })
    .trim()
    .min(1, 'Display name is required'),
  email: z.string().email('Invalid email format').optional(),
})

// ─── Phone Verification (WhatsApp OTP) ─────────────────────────────────────

// Validates an already-normalized E.164 Pakistani mobile number. Callers must
// run `normalizePakistaniNumber` first — this schema only ever sees canonical
// `+923XXXXXXXXX` input, it does not accept local/no-plus forms itself.
export const phoneNumberValidator = z.object({
  phoneNumber: z
    .string({
      required_error: 'Phone number is required',
      invalid_type_error: 'Phone number must be a string',
    })
    .regex(
      /^\+923\d{9}$/,
      'Phone number must be a valid Pakistani mobile number',
    ),
})

export const otpCodeValidator = z.object({
  code: z
    .string({
      required_error: 'Verification code is required',
      invalid_type_error: 'Verification code must be a string',
    })
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be a 6-digit number'),
})
