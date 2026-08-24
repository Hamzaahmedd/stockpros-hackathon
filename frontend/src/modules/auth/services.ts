import api from "@/shared/api/axios";
import type { OnboardingDto } from "./types";

export const requestMagicLink = (email: string) =>
  api.post("/api/v1/auth/magic-link", { email });

export const verifyMagicLink = (token: string) =>
  api.post("/api/v1/auth/verify-magic-link", { token });

export const completeOnboarding = (payload: OnboardingDto) =>
  api.post("/api/v1/auth/onboarding", payload);

export const logout = () =>
  api.post("/api/v1/auth/logout");

export const refresh = () =>
  api.post("/api/v1/auth/refresh-token");
