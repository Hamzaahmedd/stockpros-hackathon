import type { PlatformRole } from "@/modules/auth/types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useState } from "react";
import { toast } from "react-toastify";
import { adminService } from "../services";
import type { AdminTeam } from "../types";
import { apiErrorMessage, formatPaisa, hasPlatformRole } from "../utils";
import { ReasonModal } from "./ReasonModal";
import { SearchBar } from "./SearchBar";

type TeamAction =
  | { kind: "capacity"; team: AdminTeam }
  | { kind: "domain"; domainId: string; domain: string }
  | { kind: "member"; userId: string; email: string };

/** Workspace lookup (SUPPORT_AGENT+) with capacity, domain and member overrides (PLATFORM_ADMIN+). */
export function TeamsTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<TeamAction | null>(null);
  const [capacity, setCapacity] = useState("");
  const canWrite = hasPlatformRole(role, "PLATFORM_ADMIN");

  const search = async (query: string) => {
    setBusy(true);
    setLastQuery(query);
    try {
      setTeams(await adminService.searchTeams(query));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Team search failed"));
    } finally {
      setBusy(false);
    }
  };

  const capacityValue = Number(capacity);
  const capacityValid = Number.isInteger(capacityValue) && capacityValue >= 2;

  return (
    <div className="space-y-4">
      <SearchBar
        label="Search teams"
        placeholder="Team name, team ID or owner email"
        busy={busy}
        onSearch={(query) => void search(query)}
      />

      {teams && teams.length === 0 && (
        <p className="text-sm text-muted-foreground">No workspaces match “{lastQuery}”.</p>
      )}

      {teams?.map((team) => (
        <section
          key={team.id}
          aria-label={`Team ${team.name}`}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <header className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{team.name}</h3>
            <Badge variant="secondary">{team.status}</Badge>
            <Badge>
              {team.seatUtilization} seats
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">{team.id}</span>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => {
                  setCapacity(String(team.seatCapacity));
                  setAction({ kind: "capacity", team });
                }}
              >
                Override capacity
              </Button>
            )}
          </header>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>
                {team.owner.displayName ?? "—"} · {team.owner.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Credit pool</dt>
              <dd>{formatPaisa(team.creditBalanceInPaisa)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Capacity</dt>
              <dd>
                {team.seatCapacity}
                {team.scheduledSeatCapacity !== null &&
                  ` (reduces to ${team.scheduledSeatCapacity} at renewal)`}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Org instructions</dt>
              <dd className="whitespace-pre-wrap">{team.orgInstructions ?? "—"}</dd>
            </div>
          </dl>

          <div>
            <h4 className="mb-1 text-sm font-medium">Domains</h4>
            {team.domains.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            <ul className="space-y-1">
              {team.domains.map((domain) => (
                <li key={domain.id} className="flex items-center gap-2 text-sm">
                  <span>{domain.domain}</span>
                  <Badge variant={domain.isVerified ? "default" : "secondary"}>
                    {domain.isVerified ? "Verified" : "Unverified"}
                  </Badge>
                  {canWrite && !domain.isVerified && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAction({ kind: "domain", domainId: domain.id, domain: domain.domain })
                      }
                    >
                      Force verify
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-medium">Members ({team.members.length})</h4>
            <ul className="space-y-1">
              {team.members.map((member) => (
                <li key={member.user.id} className="flex items-center gap-2 text-sm">
                  <span>
                    {member.user.displayName ?? "—"} · {member.user.email}
                  </span>
                  <Badge variant="secondary">{member.role}</Badge>
                  {canWrite && member.role !== "OWNER" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAction({ kind: "member", userId: member.user.id, email: member.user.email })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {action?.kind === "capacity" && (
        <ReasonModal
          title="Override seat capacity"
          description={`Custom ceiling for ${action.team.name} (beyond the 150-seat self-serve cap). Clears any scheduled seat reduction.`}
          confirmLabel="Set capacity"
          successMessage="Seat capacity updated"
          canSubmit={capacityValid}
          onSubmit={(reason) =>
            adminService.setSeatCapacity(action.team.id, capacityValue, reason)
          }
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        >
          <label htmlFor="admin-capacity" className="block text-sm font-medium">
            Seat capacity
          </label>
          <Input
            id="admin-capacity"
            inputMode="numeric"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </ReasonModal>
      )}

      {action?.kind === "domain" && (
        <ReasonModal
          title="Force-verify domain"
          description={`Marks ${action.domain} verified without a DNS TXT check.`}
          confirmLabel="Force verify"
          successMessage="Domain verified"
          onSubmit={(reason) => adminService.verifyDomain(action.domainId, reason)}
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}

      {action?.kind === "member" && (
        <ReasonModal
          title="Remove member"
          description={`Hard-removes ${action.email} and frees their seat immediately.`}
          confirmLabel="Remove member"
          successMessage="Member removed"
          destructive
          onSubmit={(reason) => adminService.removeMember(action.userId, reason)}
          onClose={() => setAction(null)}
          onDone={() => void search(lastQuery)}
        />
      )}
    </div>
  );
}
