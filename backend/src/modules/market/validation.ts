import { z } from 'zod';  

export const topStocksQueryValidator = z.object({
  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 10))
    .refine(val => val > 0 && val <= 10, {
      message: "Limit must be between 1 and 10",
    }),
});
