import { useAuth } from "@/modules/auth/hooks/useAuth";
import { Sidebar } from "@/shared/components/Sidebar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { CreditLedgerPanel } from "@/modules/plans/components/CreditLedgerPanel";
import { DomainsTab } from "../components/DomainsTab";
import { MembersTab } from "../components/MembersTab";
import { OverviewTab } from "../components/OverviewTab";
import { PreferencesPanel } from "../components/PreferencesPanel";
import { SharedAssetsTab } from "../components/SharedAssetsTab";
import { WorkspaceSearchTab } from "../components/WorkspaceSearchTab";
import { teamService } from "../services";
import type { Team } from "../types";
import { apiErrorMessage, isTeamAdmin } from "../utils";

type WorkspaceTab =
  | "overview"
  | "members"
  | "domains"
  | "shared"
  | "search"
  | "preferences"
  | "credits";

const TABS: { id: WorkspaceTab; label: string; adminOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "domains", label: "Domains" },
  { id: "shared", label: "Shared assets" },
  { id: "search", label: "Search" },
  { id: "preferences", label: "Preferences" },
  { id: "credits", label: "Credits", adminOnly: true },
];

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
            <div className="py-16 text-center">
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
                {TABS.filter((t) => !t.adminOnly || isTeamAdmin(team.role)).map((t) => (
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
