import { useAuth } from "@/modules/auth/hooks/useAuth";
import { Sidebar } from "@/shared/components/Sidebar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { CreditLedgerPanel } from "@/modules/plans/components/CreditLedgerPanel";
import { ActivityTab } from "../components/ActivityTab";
import { BillingTab } from "../components/BillingTab";
import { DomainsTab } from "../components/DomainsTab";
import { JoinWorkspaceBanner } from "../components/JoinWorkspaceBanner";
import { MembersTab } from "../components/MembersTab";
import { OverviewTab } from "../components/OverviewTab";
import { PreferencesPanel } from "../components/PreferencesPanel";
import { SecurityTab } from "../components/SecurityTab";
import { SettingsTab } from "../components/SettingsTab";
import { SharedAssetsTab } from "../components/SharedAssetsTab";
import { WorkspaceSearchTab } from "../components/WorkspaceSearchTab";
import { teamService } from "../services";
import type { Team } from "../types";
import { apiErrorMessage, canDo, isTeamAdmin, TeamAction } from "../utils";

type WorkspaceTab =
  | "overview"
  | "members"
  | "domains"
  | "shared"
  | "search"
  | "preferences"
  | "credits"
  | "billing"
  | "activity"
  | "security"
  | "settings";

// Who sees a tab: everyone, owners and admins, or (owner) only the owner.
type TabAudience = "all" | "admin" | "owner";

const TABS: { id: WorkspaceTab; label: string; audience: TabAudience }[] = [
  { id: "overview", label: "Overview", audience: "all" },
  { id: "members", label: "Members", audience: "all" },
  { id: "domains", label: "Domains", audience: "all" },
  { id: "shared", label: "Shared assets", audience: "all" },
  { id: "search", label: "Search", audience: "all" },
  { id: "preferences", label: "Preferences", audience: "all" },
  { id: "credits", label: "Credits", audience: "admin" },
  { id: "billing", label: "Billing", audience: "admin" },
  { id: "activity", label: "Activity", audience: "admin" },
  { id: "security", label: "Security", audience: "owner" },
  // Admins can rename; the rest of the tab is owner-only.
  { id: "settings", label: "Settings", audience: "admin" },
];

const canSeeTab = (audience: TabAudience, role: Team["role"]): boolean => {
  if (audience === "all") return true;
  return canDo(role, audience === "owner" ? TeamAction.SET_AUTH_POLICY : TeamAction.MANAGE);
};

export default function TeamWorkspace() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("overview");

  const load = useCallback(async () => {
    try {
      setTeam(await teamService.getMyTeam());
      setMissing(false);
    } catch (err) {
      // 404 = the caller simply has no active workspace.
      if ((err as { response?: { status?: number } })?.response?.status === 404) {
        setMissing(true);
      } else {
        toast.error(apiErrorMessage(err, "Failed to load workspace"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />

      <main id="main-content" className="flex-1 overflow-y-auto">
        <div className="max-w-[1000px] mx-auto p-4 lg:p-8">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : missing || !team ? (
            <div className="space-y-6 py-16 text-center">
              <JoinWorkspaceBanner onJoined={() => void load()} />
              <h1 className="text-2xl font-bold">No team workspace yet</h1>
              <p className="mt-2 text-muted-foreground">
                Create a workspace to share watchlists, research and AI credits with your team.
              </p>
              <Button asChild className="mt-6">
                <Link to="/plans">See Team plan</Link>
              </Button>
            </div>
          ) : (
            <>
              <header className="mb-6 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{team.name}</h1>
                <Badge variant="secondary">{team.role}</Badge>
              </header>

              <div role="tablist" aria-label="Workspace sections" className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
                {TABS.filter((t) => canSeeTab(t.audience, team.role)).map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    size="sm"
                    variant={tab === t.id ? "default" : "ghost"}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {tab === "overview" && <OverviewTab team={team} reload={load} />}
              {tab === "members" && (
                <MembersTab
                  team={team}
                  reloadTeam={load}
                  currentUserId={user?.userId ?? ""}
                />
              )}
              {tab === "domains" && <DomainsTab team={team} reload={load} />}
              {tab === "search" && <WorkspaceSearchTab />}
              {tab === "preferences" && (
                <div className="space-y-8">
                  <section aria-labelledby="my-prefs">
                    <h2 id="my-prefs" className="mb-1 text-base font-semibold">
                      Your preferences
                    </h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Override the workspace defaults just for you.
                    </p>
                    <PreferencesPanel mode="personal" inWorkspace />
                  </section>
                  {isTeamAdmin(team.role) && (
                    <section aria-labelledby="ws-prefs" className="border-t border-border pt-8">
                      <h2 id="ws-prefs" className="mb-1 text-base font-semibold">
                        Workspace defaults
                      </h2>
                      <p className="mb-4 text-sm text-muted-foreground">
                        What everyone in the workspace gets unless they set their own.
                      </p>
                      <PreferencesPanel mode="workspace" />
                    </section>
                  )}
                </div>
              )}
              {tab === "credits" && isTeamAdmin(team.role) && (
                <CreditLedgerPanel scope="TEAM" />
              )}
              {tab === "billing" && isTeamAdmin(team.role) && (
                <BillingTab team={team} reload={load} />
              )}
              {tab === "activity" && isTeamAdmin(team.role) && <ActivityTab />}
              {tab === "security" && canDo(team.role, TeamAction.SET_AUTH_POLICY) && (
                <SecurityTab team={team} reload={load} />
              )}
              {tab === "settings" && isTeamAdmin(team.role) && (
                <SettingsTab
                  team={team}
                  reload={load}
                  isOwner={canDo(team.role, TeamAction.DELETE_TEAM)}
                />
              )}
              {tab === "shared" && (
                <SharedAssetsTab team={team} currentUserId={user?.userId ?? ""} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
