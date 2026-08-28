import { z } from 'zod'

export const forecastQueryValidator = z.object({
  symbol: z
    .string({
      required_error: 'Symbol is required',
      invalid_type_error: 'Symbol must be a string',
    })
    .min(1, 'Symbol cannot be empty')
    .toUpperCase(),
  period: z.enum(['1d', '1w']),
})
