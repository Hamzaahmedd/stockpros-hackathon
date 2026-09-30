import { useAuth } from "@/modules/auth/hooks/useAuth";
import { apiErrorMessage } from "@/shared/utils/api-error";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  shouldAcceptPendingInvite,
} from "../pendingInvite";
import { teamService } from "../services";

/**
 * Mounted once at the app root. If a visitor arrived via an invite link while
 * signed out, the token was parked in storage (see InviteEntry); once they've
 * finished signing in — by any route: magic link, Google, onboarding, phone
 * verification — this accepts the invite and lands them in the workspace.
 */
export function PendingInviteAcceptor() {
  const { user, loading, refreshMe } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inFlight = useRef(false);

  useEffect(() => {
    if (loading || inFlight.current) return;
    if (!shouldAcceptPendingInvite(pathname, Boolean(user))) return;

    const token = getPendingInviteToken();
    if (!token) return;

    inFlight.current = true;
    // Cleared up front so a failed attempt (expired invite, wrong email) can
    // never loop; the user sees the reason and can ask for a fresh invite.
    clearPendingInviteToken();

    teamService
      .acceptInvite(token)
      .then(async () => {
        await refreshMe(); // plan becomes TEAM, which reveals the Workspace nav item
        toast.success("Welcome to the team!");
        navigate("/teams", { replace: true });
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, "This invite is invalid or has expired"));
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [user, loading, pathname, navigate, refreshMe]);

  return null;
}
