import z from "zod";
import { AppError } from './app-error';

export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, true);
    this.details = details;
  }
}

export const validateOrThrow = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const flattened = result.error.flatten();
    const fieldErrors = Object.values(flattened.fieldErrors).flat();
    const formErrors = flattened.formErrors;
    const errorMessages = [...fieldErrors, ...formErrors].join(', ') || 'Invalid input';
    throw new ValidationError(`Validation failed: ${errorMessages}`, flattened);
  }
  
  return result.data;
};