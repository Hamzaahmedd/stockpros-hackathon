import { ProtectedRoute } from "@/modules/auth/components/ProtectedRoute";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { setPendingInviteToken } from "../pendingInvite";
import AcceptInvite from "./AcceptInvite";

/**
 * Public landing route for invite links (`/teams/invite?token=…`, alias
 * `/teams/invites/accept?token=…`). Signed-out visitors have the token parked
 * in storage and are sent to /login — PendingInviteAcceptor picks it up once
 * they're signed in. Signed-in visitors get the normal confirm-and-join page.
 */
export default function InviteEntry() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const signedOut = !loading && !user;

  useEffect(() => {
    if (signedOut && token) setPendingInviteToken(token);
  }, [signedOut, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-4 w-32 bg-primary/10 rounded-md animate-pulse" />
      </div>
    );
  }

  if (signedOut) return <Navigate to="/login" replace />;

  return (
    <ProtectedRoute resource="CORE_APP">
      <AcceptInvite />
    </ProtectedRoute>
  );
}
