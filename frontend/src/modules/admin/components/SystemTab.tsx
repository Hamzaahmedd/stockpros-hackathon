import type { PlatformRole } from "@/modules/auth/types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ADMIN_AUDIT_ACTIONS } from "../constants";
import { adminService } from "../services";
import type { AdminAuditAction, AdminAuditEntry, AdminPage } from "../types";
import { actionLabel, apiErrorMessage, formatDateTime, hasPlatformRole } from "../utils";
import { Pager } from "./Pager";
import { ReasonModal } from "./ReasonModal";

/** Emergency market halt (SUPER_ADMIN) and the searchable staff audit log (SUPPORT_AGENT+). */
export function SystemTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [closed, setClosed] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [action, setAction] = useState<AdminAuditAction | "">("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AdminPage<AdminAuditEntry> | null>(null);
  const canToggle = hasPlatformRole(role, "SUPER_ADMIN");

  const loadStatus = useCallback(async () => {
    try {
      setClosed((await adminService.getMarketStatus()).emergencyClosed);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load market status"));
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      setLogs(
        await adminService.listAuditLogs(
          { action: action || undefined, targetId: targetId.trim() || undefined },
          page,
        ),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load audit log"));
      setLogs((current) => current ?? { items: [], total: 0, page: 1, limit: 25 });
    }
  }, [action, targetId, page]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="market-heading" className="space-y-3">
        <h2 id="market-heading" className="text-base font-semibold">
          Emergency market status
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {closed === null ? (
            <span className="text-sm text-muted-foreground">Loading…</span>
          ) : (
            <Badge variant={closed ? "destructive" : "secondary"}>
              {closed ? "Market HALTED" : "Normal calendar"}
            </Badge>
          )}
          {canToggle && closed !== null && (
            <Button
              variant={closed ? "default" : "destructive"}
              onClick={() => setConfirming(true)}
            >
              {closed ? "Resume market" : "Halt market"}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          In-memory on the serving instance only; resets on process restart.
        </p>
      </section>

      <section aria-labelledby="audit-heading" className="space-y-3">
        <h2 id="audit-heading" className="text-base font-semibold">
          Audit log
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Audit action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value as AdminAuditAction | "");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All actions</option>
            {ADMIN_AUDIT_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {actionLabel(value)}
              </option>
            ))}
          </select>
          <Input
            aria-label="Target ID"
            className="max-w-xs"
            placeholder="Target ID"
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {logs && logs.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No staff actions recorded.</p>
        )}
        {logs && logs.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.admin.displayName ?? entry.admin.id}</TableCell>
                    <TableCell>{actionLabel(entry.action)}</TableCell>
                    <TableCell>
                      <div className="text-xs">{entry.targetType}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{entry.targetId}</div>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-pre-wrap">{entry.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {logs && <Pager result={logs} onPage={setPage} />}
      </section>

      {confirming && closed !== null && (
        <ReasonModal
          title={closed ? "Resume market" : "Halt market"}
          description={
            closed
              ? "Returns the market to its normal trading calendar."
              : "Treats the market as closed immediately, without a restart."
          }
          confirmLabel={closed ? "Resume market" : "Halt market"}
          successMessage={closed ? "Market resumed" : "Market halted"}
          destructive={!closed}
          onSubmit={(reason) => adminService.setMarketEmergency(!closed, reason)}
          onClose={() => setConfirming(false)}
          onDone={() => {
            void loadStatus();
            void loadLogs();
          }}
        />
      )}
    </div>
  );
}
