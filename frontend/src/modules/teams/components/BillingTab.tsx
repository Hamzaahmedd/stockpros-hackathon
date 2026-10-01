import { formatPaisa } from "@/modules/plans/utils";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
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
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { Team, TeamTransaction } from "../types";
import { apiErrorMessage, formatDate } from "../utils";
import { ReceiptModal } from "./ReceiptModal";

interface BillingTabProps {
  team: Team;
  reload: () => void;
}

const MIN_SEATS = 2;

function BillingContactCard({ team, reload }: BillingTabProps) {
  const [email, setEmail] = useState(team.billingEmail ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (value: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await teamService.updateBillingContact(value);
      toast.success(value ? "Billing contact saved" : "Billing contact cleared");
      if (!value) setEmail("");
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update billing contact"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Billing contact</CardTitle>
        <CardDescription>
          Renewal reminders and payment receipts go to{" "}
          {team.billingEmail ?? "the workspace owner"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (value) void save(value);
          }}
        >
          <div className="min-w-[240px] flex-1">
            <label htmlFor="billing-email" className="text-sm font-medium">
              Billing email
            </label>
            <Input
              id="billing-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accounts@yourfund.com"
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={saving || !email.trim()}>
            Save
          </Button>
          {team.billingEmail && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void save(null)}
            >
              Use the owner
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function SeatPlanCard({ team, reload }: BillingTabProps) {
  const { capacity, scheduledCapacity, active, pendingInvites } = team.seats;
  const inUse = active + pendingInvites;
  const floor = Math.max(MIN_SEATS, inUse);
  const [seats, setSeats] = useState(String(floor));
  const [saving, setSaving] = useState(false);

  const parsed = Number(seats);
  const valid = Number.isInteger(parsed) && parsed >= floor && parsed < capacity;

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await action();
      toast.success(success);
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seat plan</CardTitle>
        <CardDescription>
          {capacity} seats now; {inUse} in use (members plus pending invites).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scheduledCapacity !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <p>
              Your next renewal will bill <strong>{scheduledCapacity} seats</strong>. Invites are
              already limited to that number.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                void run(
                  () => teamService.cancelSeatReduction(),
                  "Seat reduction cancelled",
                  "Failed to cancel the reduction",
                )
              }
            >
              Cancel reduction
            </Button>
          </div>
        ) : capacity > floor ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                void run(
                  () => teamService.scheduleSeatReduction(parsed),
                  "Seat reduction scheduled",
                  "Failed to schedule the reduction",
                );
            }}
          >
            <div>
              <label htmlFor="reduce-seats" className="text-sm font-medium">
                Seats from the next renewal
              </label>
              <Input
                id="reduce-seats"
                type="number"
                min={floor}
                max={capacity - 1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
            <Button type="submit" variant="outline" disabled={saving || !valid}>
              Schedule reduction
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            There are no spare seats to drop — remove members or revoke invites first.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          A reduction takes effect at your next renewal. Nothing is refunded for the current term.
        </p>
      </CardContent>
    </Card>
  );
}

function ReceiptsCard() {
  const [entries, setEntries] = useState<TeamTransaction[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    try {
      const page = await teamService.listTransactions(cursor);
      const list = Array.isArray(page.entries) ? page.entries : [];
      setEntries((current) => (cursor && current ? [...current, ...list] : list));
      setNextCursor(page.nextCursor ?? null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load billing history"));
      setEntries((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeReceipt = useCallback(() => setViewing(null), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Receipts</CardTitle>
        <CardDescription>Payments for this workspace, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <Skeleton className="h-32 w-full" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">{entry.referenceNumber}</TableCell>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    <TableCell>
                      {entry.description}
                      {entry.status === "REFUNDED" && (
                        <span className="text-xs text-muted-foreground"> (refunded)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatPaisa(entry.amountPaisa)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`View receipt ${entry.referenceNumber}`}
                        onClick={() => setViewing(entry.id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {nextCursor && (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
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
      </CardContent>
      <ReceiptModal transactionId={viewing} onClose={closeReceipt} />
    </Card>
  );
}

export function BillingTab({ team, reload }: BillingTabProps) {
  return (
    <div className="space-y-6">
      <BillingContactCard key={team.billingEmail ?? "none"} team={team} reload={reload} />
      <SeatPlanCard key={team.seats.scheduledCapacity ?? "none"} team={team} reload={reload} />
      <ReceiptsCard />
    </div>
  );
}
