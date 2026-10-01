import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { adminService } from "../services";
import type { AdminQueueHealth } from "../types";
import { apiErrorMessage } from "../utils";

/**
 * Background-queue health (email workers, subscription cron). Product usage
 * analytics are deliberately absent: PostHog owns those, and billing usage is
 * in the credit ledger.
 */
export function TelemetryTab() {
  const [queues, setQueues] = useState<AdminQueueHealth[] | null>(null);

  const load = useCallback(async () => {
    try {
      setQueues(await adminService.getQueueHealth());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load queue health"));
      setQueues((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="queues-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="queues-heading" className="text-base font-semibold">
          Queue health
        </h2>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {queues === null && <Skeleton className="h-24 w-full" />}
      {queues?.length === 0 && <p className="text-sm text-muted-foreground">No queues reported.</p>}
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
  );
}
