// Route guard for /auth/verify-phone — mirrors ProtectedRoute's loading/auth
// checks, plus rules specific to this step of the login flow:
//   - No authenticated/post-login session -> redirect to /login
//   - Phone already verified -> redirect straight past this screen (to
//     onboarding if the profile still needs completing, else the dashboard)
//     so a verified user can't land on or re-submit the verify-phone screen.
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/modules/auth/hooks/useAuth";

export const VerifyPhoneGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 animate-pulse" />
          <div className="h-4 w-32 bg-primary/10 rounded-md animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.phoneVerifiedAt) {
    if (!user.displayName || user.displayName.trim() === "") {
      return <Navigate to="/auth/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
