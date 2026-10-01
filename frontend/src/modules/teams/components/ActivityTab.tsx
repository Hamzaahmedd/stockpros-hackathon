import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
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
import { teamService } from "../services";
import type { AuditLogEntry } from "../types";
import { apiErrorMessage, auditActionLabel } from "../utils";

const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Who did what in the workspace — the admin audit trail, newest first. */
export function ActivityTab() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    try {
      const page = await teamService.listAuditLog(cursor);
      const list = Array.isArray(page.entries) ? page.entries : [];
      setEntries((current) => (cursor && current ? [...current, ...list] : list));
      setNextCursor(page.nextCursor ?? null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load activity"));
      setEntries((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (entries === null) return <Skeleton className="h-48 w-full" />;
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Affected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
                <TableCell>{entry.actorName ?? (entry.actorUserId ? "Former member" : "System")}</TableCell>
                <TableCell>{auditActionLabel(entry.action)}</TableCell>
                <TableCell>
                  {entry.targetName ?? (entry.targetUserId ? "Former member" : "—")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button
          type="button"
          variant="outline"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(nextCursor);
            setLoadingMore(false);
          }}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
