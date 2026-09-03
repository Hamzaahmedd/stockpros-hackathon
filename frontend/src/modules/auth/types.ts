export type User = {
  id?: string;
  userId: string;
  email: string;
  displayName?: string;
  roles?: any[];
  userRoles?: any[];
} | null;

export type ScreenPermissions = {
  canRead?: boolean;
  canWrite?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

export type RequestMagicLinkDto = {
  email: string;
};

export type OnboardingDto = {
  displayName: string;
};

export type AuthContextValue = {
  user: User;
  screenPermissions: Record<string, ScreenPermissions>;
  loading: boolean;
  sendMagicLink: (email: string) => Promise<boolean>;
  login: (email: string) => Promise<boolean>;
  register: (payload: { email: string }) => Promise<void>;
  logout: () => Promise<void>;
  can: (resource: string, action: keyof ScreenPermissions) => boolean;
  refreshMe: () => Promise<void>;
};

export type { LoginFormValues, OnboardingFormValues } from "./validation";

export interface SuggestedSymbol {
  symbol: string;
  name: string;
  sector: string;
  category: "all" | "tech" | "growth" | "consumer" | "index";
  hasAiForecast: boolean;
}

export type NotificationPreferenceToggle =
  | "inAppAlertsEnabled"
  | "emailVolatilityAlertsEnabled"
  | "dailyDigestEnabled";
