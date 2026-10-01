import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { adminService } from "../services";
import type { AdminPage, AdminQueueHealth, AdminUsageEvent, UsageFilters } from "../types";
import { apiErrorMessage, formatDateTime, formatPaisa } from "../utils";
import { Pager } from "./Pager";

const EMPTY_FILTERS: UsageFilters = { userId: "", teamId: "", symbol: "", feature: "" };
const FILTER_FIELDS: { key: keyof UsageFilters; label: string }[] = [
  { key: "userId", label: "User ID" },
  { key: "teamId", label: "Team ID" },
  { key: "symbol", label: "Symbol" },
  { key: "feature", label: "Feature" },
];

/** Read-only usage-event search and background-queue health (SUPPORT_AGENT+). */
export function TelemetryTab() {
  const [draft, setDraft] = useState<UsageFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<UsageFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [usage, setUsage] = useState<AdminPage<AdminUsageEvent> | null>(null);
  const [queues, setQueues] = useState<AdminQueueHealth[] | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await adminService.searchUsage(applied, page));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load usage events"));
      setUsage((current) => current ?? { items: [], total: 0, page: 1, limit: 25 });
    }
  }, [applied, page]);

  const loadQueues = useCallback(async () => {
    try {
      setQueues(await adminService.getQueueHealth());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load queue health"));
      setQueues((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="queues-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="queues-heading" className="text-base font-semibold">
            Queue health
          </h2>
          <Button size="sm" variant="ghost" onClick={() => void loadQueues()}>
            Refresh
          </Button>
        </div>
        {queues === null && <Skeleton className="h-24 w-full" />}
        <div className="grid gap-3 sm:grid-cols-2">
          {queues?.map((queue) => (
            <article key={queue.name} className="rounded-lg border border-border p-3 text-sm">
              <h3 className="font-medium">{queue.name}</h3>
              {queue.available ? (
                <>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(queue.counts).map(([state, count]) => (
                      <li key={state}>
                        <Badge variant={state === "failed" && count > 0 ? "destructive" : "secondary"}>
                          {state}: {count}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  {queue.recentFailures.map((job, index) => (
                    <p key={job.id ?? `${job.name}-${index}`} className="mt-2 text-xs text-muted-foreground">
                      {job.name} failed after {job.attemptsMade} attempt(s): {job.failedReason || "no reason recorded"}
                    </p>
                  ))}
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Unavailable (Redis not connected).</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="usage-heading" className="space-y-3">
        <h2 id="usage-heading" className="text-base font-semibold">
          Signal usage
        </h2>
        <form onSubmit={submit} className="flex flex-wrap gap-2" aria-label="Usage filters">
          {FILTER_FIELDS.map(({ key, label }) => (
            <Input
              key={key}
              aria-label={label}
              placeholder={label}
              className="max-w-[12rem]"
              value={draft[key] ?? ""}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          ))}
          <Button type="submit">Apply</Button>
        </form>

        {usage && usage.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No usage events found.</p>
        )}
        {usage && usage.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                    <TableCell>{event.feature}</TableCell>
                    <TableCell>{event.symbol ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[10px]">{event.userId}</TableCell>
                    <TableCell className="font-mono text-[10px]">{event.teamId ?? "—"}</TableCell>
                    <TableCell>{formatPaisa(event.costPaisa)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {usage && <Pager result={usage} onPage={setPage} />}
      </section>
    </div>
  );
}
