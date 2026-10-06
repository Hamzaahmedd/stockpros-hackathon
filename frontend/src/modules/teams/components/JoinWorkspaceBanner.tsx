import { useAuth } from "@/modules/auth/hooks/useAuth";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import { JoinRequestStatus, type JoinOption, type MyJoinRequest } from "../types";
import { apiErrorMessage, joinActionLabel } from "../utils";

interface JoinWorkspaceBannerProps {
  /** Called after the caller joined at once (auto-approve), once their session is refreshed. */
  onJoined: () => void;
}

/**
 * For a signed-in user with no workspace whose verified email domain belongs to
 * one: offers to join (or ask to join) it, and shows the pending request with a
 * way to withdraw it. Renders nothing when there is nothing to offer.
 */
export function JoinWorkspaceBanner({ onJoined }: JoinWorkspaceBannerProps) {
  const { user, refreshMe } = useAuth();
  const hasWorkspace = user?.plan === "TEAM";
  const [options, setOptions] = useState<JoinOption[]>([]);
  const [pending, setPending] = useState<MyJoinRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, joinable] = await Promise.all([
        teamService.getMyJoinRequest(),
        teamService.listJoinOptions(),
      ]);
      setPending(mine);
      setOptions(joinable);
    } catch {
      // Best-effort: a failed lookup just means no banner.
      setPending(null);
      setOptions([]);
    }
  }, []);

  useEffect(() => {
    if (user && !hasWorkspace) void load();
  }, [user, hasWorkspace, load]);

  const join = async (option: JoinOption) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await teamService.requestToJoin(option.teamId);
      if (result.status === JoinRequestStatus.APPROVED) {
        await refreshMe(); // plan becomes TEAM, which reveals the Workspace nav item
        toast.success(`Welcome to ${option.teamName}!`);
        onJoined();
      } else {
        toast.success(`Request sent to ${option.teamName}`);
        await load();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to send your request"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await teamService.cancelMyJoinRequest();
      toast.success("Request cancelled");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to cancel your request"));
    } finally {
      setBusy(false);
    }
  };

  if (!user || hasWorkspace) return null;

  if (pending) {
    return (
      <Card role="status">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            Your request to join <strong>{pending.teamName}</strong> is pending admin approval.
          </p>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>
            Cancel request
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      {options.map((option) => (
        <Card key={option.teamId}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Workspace found</p>
              <p className="text-sm text-muted-foreground">
                {option.teamName} uses {option.domain} — your colleagues are already here.
              </p>
            </div>
            <Button type="button" disabled={busy} onClick={() => void join(option)}>
              {joinActionLabel(option)}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
