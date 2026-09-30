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
import { apiErrorMessage } from "@/shared/utils/api-error";
import { useCallback, useEffect, useState } from "react";
import { creditService } from "../services";
import type { CreditLedgerEntry, CreditLedgerType, SubscriptionScope } from "../types";
import { formatPaisa } from "../utils";

const TYPE_LABELS: Record<CreditLedgerType, string> = {
  PURCHASE: "Top-up",
  OVERAGE_CONSUMPTION: "Used",
  REFUND: "Refund",
};

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Signed amount, e.g. "+Rs 500" / "−Rs 50" (paisa in, rupees out). */
const formatSigned = (paisa: number): string =>
  `${paisa < 0 ? "−" : "+"}${formatPaisa(Math.abs(paisa))}`;

interface CreditLedgerPanelProps {
  /** USER = your own activity; TEAM = the whole workspace pool (owner/admin only). */
  scope: SubscriptionScope;
}

/** Newest-first credit history with the current balance and "load more" pagination. */
export function CreditLedgerPanel({ scope }: CreditLedgerPanelProps) {
  const [entries, setEntries] = useState<CreditLedgerEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await creditService.getLedger(scope);
      setEntries(page.entries);
      setBalance(page.balanceInPaisa);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your credit history"));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await creditService.getLedger(scope, nextCursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setBalance(page.balanceInPaisa);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load more entries"));
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  if (error && entries.length === 0) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm text-red-500">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={loadFirstPage}>
          Try again
        </Button>
      </div>
    );
  }

  const showMember = scope === "TEAM";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-bold" data-testid="ledger-balance">
          {formatPaisa(balance ?? 0)}
        </p>
        <p className="text-sm text-muted-foreground">
          {scope === "TEAM" ? "workspace credit balance" : "your credit balance"}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No credit activity yet. Top-ups and pay-as-you-go usage will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                {showMember && <TableHead>Member</TableHead>}
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatWhen(entry.createdAt)}</TableCell>
                  <TableCell>{TYPE_LABELS[entry.type]}</TableCell>
                  <TableCell>
                    {entry.description}
                    {!showMember && entry.isTeamPool && (
                      <span className="text-xs text-muted-foreground"> · workspace pool</span>
                    )}
                  </TableCell>
                  {showMember && <TableCell>{entry.memberName ?? "—"}</TableCell>}
                  <TableCell
                    className={`text-right font-medium ${
                      entry.amountPaisa < 0 ? "text-red-500" : "text-emerald-500"
                    }`}
                  >
                    {formatSigned(entry.amountPaisa)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {nextCursor && (
        <Button type="button" variant="outline" disabled={loadingMore} onClick={handleLoadMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
