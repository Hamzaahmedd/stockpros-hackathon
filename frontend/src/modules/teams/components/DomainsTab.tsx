import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { DomainVerification, Team } from "../types";
import { apiErrorMessage, isTeamAdmin } from "../utils";

interface DomainsTabProps {
  team: Team;
  reload: () => void;
}

export function DomainsTab({ team, reload }: DomainsTabProps) {
  const admin = isTeamAdmin(team.role);
  const [domain, setDomain] = useState("");
  const [restrict, setRestrict] = useState(true);
  const [busy, setBusy] = useState(false);
  // DNS instructions for domains added/checked this session (the list endpoint never re-exposes tokens).
  const [instructions, setInstructions] = useState<Record<string, DomainVerification>>({});

  const remember = (result: DomainVerification) =>
    setInstructions((prev) => ({ ...prev, [result.domain]: result }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = domain.trim().toLowerCase();
    if (busy || !value) return;
    setBusy(true);
    try {
      const result = await teamService.addDomain(value, restrict);
      remember(result);
      setDomain("");
      toast[result.isVerified ? "success" : "info"](
        result.isVerified
          ? `${result.domain} verified`
          : "Domain added — publish the DNS record below, then check again",
      );
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add domain"));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (value: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await teamService.verifyDomain(value);
      remember(result);
      if (result.isVerified) {
        toast.success(`${value} verified`);
        reload();
      } else {
        toast.info("We couldn't find the DNS record yet — DNS changes can take a while");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Verification failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company domains</CardTitle>
          <CardDescription>
            Verify your company domain to stop colleagues from creating separate workspaces —
            they&apos;ll be asked to request a seat from you instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {team.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">No domains added yet.</p>
          ) : (
            <ul className="space-y-4">
              {team.domains.map((d) => {
                const info = instructions[d.domain];
                return (
                  <li key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.domain}</span>
                        <Badge variant={d.isVerified ? "default" : "secondary"}>
                          {d.isVerified ? "Verified" : "Pending"}
                        </Badge>
                        {d.restrictOrgCreation && (
                          <Badge variant="outline">Restricts new workspaces</Badge>
                        )}
                      </div>
                      {admin && !d.isVerified && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleVerify(d.domain)}
                        >
                          Check verification
                        </Button>
                      )}
                    </div>
                    {!d.isVerified && <DnsInstructions info={info} />}
                  </li>
                );
              })}
            </ul>
          )}

          {admin && (
            <form onSubmit={handleAdd} className="space-y-3 border-t border-border pt-4">
              <label htmlFor="domain-input" className="text-sm font-medium">
                Add a domain
              </label>
              <div className="flex gap-2">
                <Input
                  id="domain-input"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yourfund.com"
                />
                <Button type="submit" disabled={busy || !domain.trim()}>
                  Add & verify
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={restrict}
                  onChange={(e) => setRestrict(e.target.checked)}
                />
                Block employees with this email domain from creating their own workspace
              </label>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DnsInstructions({ info }: { info: DomainVerification | undefined }) {
  if (!info) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Use &quot;Check verification&quot; to reload the DNS record to publish.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-1 rounded-md bg-muted/50 p-3 text-xs">
      <p className="font-medium">Add this {info.verification.recordType} record at your DNS provider:</p>
      <p>
        <span className="text-muted-foreground">Name: </span>
        <code className="break-all">{info.verification.recordName}</code>
      </p>
      <p>
        <span className="text-muted-foreground">Value: </span>
        <code className="break-all">{info.verification.recordValue}</code>
      </p>
    </div>
  );
}
