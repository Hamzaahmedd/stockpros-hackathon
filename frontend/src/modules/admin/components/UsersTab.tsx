import type { PlanTier, PlatformRole } from "@/modules/auth/types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { useState } from "react";
import { toast } from "react-toastify";
import { ADMIN_PLANS } from "../constants";
import { adminService } from "../services";
import type { AdminUser } from "../types";
import { apiErrorMessage, formatDateTime, formatPaisa, hasPlatformRole } from "../utils";
import { CustomerIdentity } from "./CustomerIdentity";
import { CustomerTimeline } from "./CustomerTimeline";
import { ReasonModal } from "./ReasonModal";
import { SearchBar } from "./SearchBar";

type UserAction = { kind: "plan" | "sessions"; user: AdminUser };

/** User lookup (SUPPORT_AGENT+) with plan override and session invalidation (SUPER_ADMIN). */
export function UsersTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<UserAction | null>(null);
  const [plan, setPlan] = useState<PlanTier>("PRO");
  const [timelineFor, setTimelineFor] = useState<string | null>(null);
  const canWrite = hasPlatformRole(role, "SUPER_ADMIN");

  const search = async (query: string) => {
    setBusy(true);
    setLastQuery(query);
    try {
      setUsers(await adminService.searchUsers(query));
    } catch (err) {
      toast.error(apiErrorMessage(err, "User search failed"));
    } finally {
      setBusy(false);
    }
  };

  const openPlan = (user: AdminUser) => {
    setPlan(user.plan);
    setAction({ kind: "plan", user });
  };

  return (
    <div className="space-y-4">
      <SearchBar
        label="Search users"
        placeholder="Email, user ID or name"
        busy={busy}
        onSearch={(query) => void search(query)}
      />

      {users && users.length === 0 && (
        <p className="text-sm text-muted-foreground">No users match “{lastQuery}”.</p>
      )}

      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <CustomerIdentity
                      userId={user.id}
                      displayName={user.displayName}
                      email={user.email}
                      masked={user.piiMasked}
                    />
                    <div className="font-mono text-[10px] text-muted-foreground">{user.id}</div>
                    {user.platformRole !== "USER" && (
                      <Badge variant="secondary" className="mt-1">
                        {user.platformRole}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge>{user.plan}</Badge>
                    {user.team && (
                      <div className="mt-1 text-xs text-muted-foreground">Team {user.team.role}</div>
                    )}
                  </TableCell>
                  <TableCell>{formatPaisa(user.creditBalanceInPaisa)}</TableCell>
                  <TableCell>{user.activeSessions}</TableCell>
                  <TableCell>
                    {user.subscription ? (
                      <>
                        <div>
                          {user.subscription.planTier} · {user.subscription.status}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Ends {formatDateTime(user.subscription.currentPeriodEnd)}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setTimelineFor(user.id)}>
                      Timeline
                    </Button>
                    {canWrite && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openPlan(user)}>
                          Change plan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ kind: "sessions", user })}
                        >
                          Revoke sessions
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {timelineFor && <CustomerTimeline userId={timelineFor} onClose={() => setTimelineFor(null)} />}

      {action?.kind === "plan" && (
        <ReasonModal
          title="Override plan"
          description={`Sets ${action.user.email} directly, bypassing Safepay. Leaving TEAM removes a non-owner member from their workspace; owners must transfer ownership first.`}
          confirmLabel="Override plan"
          successMessage="Plan overridden"
          onSubmit={(reason, ticketRef) =>
            adminService.overridePlan(action.user.id, plan, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        >
          <label htmlFor="admin-plan" className="block text-sm font-medium">
            New plan
          </label>
          <select
            id="admin-plan"
            value={plan}
            onChange={(event) => setPlan(event.target.value as PlanTier)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ADMIN_PLANS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </ReasonModal>
      )}

      {action?.kind === "sessions" && (
        <ReasonModal
          title="Revoke all sessions"
          description={`Signs ${action.user.email} out everywhere. Use for security incidents.`}
          confirmLabel="Revoke sessions"
          successMessage="Sessions revoked"
          destructive
          onSubmit={(reason, ticketRef) =>
            adminService.invalidateSessions(action.user.id, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}
    </div>
  );
}
