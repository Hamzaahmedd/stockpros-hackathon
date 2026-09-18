import { z } from 'zod'

// Reusable across any module whose routes take a `:id` UUID route param
// (e.g. `/alerts/:id`) — every model in this app uses uuid_generate_v7() ids.
export const uuidParamValidator = z.object({
  id: z.string().uuid('Invalid id'),
})
