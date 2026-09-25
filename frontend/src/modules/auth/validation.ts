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

export const requestPhoneOtpSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(
      /^(\+92|92|0)3\d{9}$/,
      "Enter a valid Pakistani mobile number (e.g. 03XXXXXXXXX)"
    ),
});

export type RequestPhoneOtpFormValues = z.infer<typeof requestPhoneOtpSchema>;

export const verifyPhoneOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code sent to your WhatsApp"),
});

export type VerifyPhoneOtpFormValues = z.infer<typeof verifyPhoneOtpSchema>;
