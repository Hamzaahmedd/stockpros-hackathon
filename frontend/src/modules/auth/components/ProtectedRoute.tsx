// src/routes/ProtectedRoute.tsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import type { ScreenPermissions } from "../types";

interface Props {
  children: React.ReactNode;
  resource?: string;
  action?: keyof ScreenPermissions;
  requirements?: readonly {
    resource: string;
    action?: keyof ScreenPermissions;
  }[];
}

export const ProtectedRoute: React.FC<Props> = ({ children, resource, action = "canRead", requirements }) => {
  const { user, loading, can } = useAuth();
  const requiredPermissions = requirements ?? (resource ? [{ resource, action }] : []);

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

  if (!requiredPermissions.every(({ resource, action }) => can(resource, action ?? "canRead"))) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <section className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Access denied</h1>
          <p className="text-muted-foreground">
            Your assigned permissions do not allow access to this area.
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
};
