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
  canCreate?: boolean;
  canUpdate?: boolean;
  canArchive?: boolean;
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
