// src/routes/ProtectedRoute.tsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/modules/auth/hooks/useAuth";

interface Props {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
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

  return <>{children}</>;
};