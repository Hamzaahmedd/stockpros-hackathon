import z from "zod";

export const symbolLookupQueryValidator = z.object({
  q: z.string().min(1, 'Query parameter is required'),
  exchange: z.string().optional(),
})