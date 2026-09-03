import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address")
    .min(1, "Email is required")
    .trim()
    .toLowerCase(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters"),
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;
