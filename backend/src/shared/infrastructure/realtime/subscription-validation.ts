import { z } from 'zod'

export const socketSubscribeValidator = z.object({
  symbol: z.string().min(1).transform((symbol) => symbol.toUpperCase()),
})
