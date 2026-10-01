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
import { CreditTarget, PAYMENT_STATUSES, UUID_PATTERN } from "../constants";
import { adminService } from "../services";
import type { AdminPage, AdminWebhook, PaymentStatus } from "../types";
import { apiErrorMessage, formatDateTime, formatPaisa, hasPlatformRole } from "../utils";
import { CreditLedgerSection } from "./CreditLedgerSection";
import { Pager } from "./Pager";
import { ReasonModal } from "./ReasonModal";

type BillingAction = "credits" | "extend" | { retry: AdminWebhook };

/** Safepay webhook diagnostics (SUPPORT_AGENT+), plus credit and subscription interventions (PLATFORM_ADMIN+). */
export function BillingTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [trackerId, setTrackerId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminPage<AdminWebhook> | null>(null);
  const [action, setAction] = useState<BillingAction | null>(null);
  const canWrite = hasPlatformRole(role, "PLATFORM_ADMIN");

  const [creditTarget, setCreditTarget] = useState<CreditTarget>(CreditTarget.USER);
  const [creditTargetId, setCreditTargetId] = useState("");
  const [amountPaisa, setAmountPaisa] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [graceEnd, setGraceEnd] = useState("");

  const load = useCallback(async () => {
    try {
      setResult(
        await adminService.listWebhooks(
          { status: status || undefined, trackerId: trackerId.trim() || undefined },
          page,
        ),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load webhooks"));
      setResult((current) => current ?? { items: [], total: 0, page: 1, limit: 25 });
    }
  }, [status, trackerId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const paisaValue = Number(amountPaisa);
  const creditsValid =
    UUID_PATTERN.test(creditTargetId.trim()) && Number.isInteger(paisaValue) && paisaValue !== 0;
  const extendValid = UUID_PATTERN.test(subscriptionId.trim()) && Boolean(periodEnd || graceEnd);

  const toIso = (value: string): string | undefined =>
    value ? new Date(value).toISOString() : undefined;

  return (
    <div className="space-y-8">
      <section aria-labelledby="webhooks-heading" className="space-y-3">
        <h2 id="webhooks-heading" className="text-base font-semibold">
          Safepay webhooks
        </h2>
        <p className="text-xs text-muted-foreground">
          Only signature-verified (X-SFPY-SIGNATURE) deliveries are stored; rejected ones never appear.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Payment status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PaymentStatus | "");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Input
            aria-label="Tracker ID"
            className="max-w-xs"
            placeholder="Tracker ID"
            value={trackerId}
            onChange={(event) => {
              setTrackerId(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {result && result.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        )}
        {result && result.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Webhook</TableHead>
                  <TableHead>Created</TableHead>
                  {canWrite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.trackerId}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.kind} · {row.planTier}
                    </TableCell>
                    <TableCell>{formatPaisa(row.amountPaisa)}</TableCell>
                    <TableCell>
                      {row.webhookReceived
                        ? `Received${row.signatureVerified ? " · signature OK" : ""}`
                        : "Not received"}
                    </TableCell>
                    <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!row.webhookReceived}
                          onClick={() => setAction({ retry: row })}
                        >
                          Retry
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {result && <Pager result={result} onPage={setPage} />}
      </section>

      <CreditLedgerSection />

      {canWrite && (
        <section aria-labelledby="interventions-heading" className="space-y-3">
          <h2 id="interventions-heading" className="text-base font-semibold">
            Interventions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAction("credits")}>
              Adjust credits
            </Button>
            <Button variant="outline" onClick={() => setAction("extend")}>
              Extend subscription
            </Button>
          </div>
        </section>
      )}

      {typeof action === "object" && action !== null && (
        <ReasonModal
          title="Retry webhook fulfilment"
          description={`Replays the stored payload for ${action.retry.trackerId}. Already-settled transactions are a safe no-op.`}
          confirmLabel="Retry"
          successMessage="Webhook reprocessed"
          onSubmit={(reason, ticketRef) =>
            adminService.retryWebhook(action.retry.id, reason, ticketRef)
          }
          onClose={() => setAction(null)}
          onDone={() => void load()}
        />
      )}

      {action === "credits" && (
        <ReasonModal
          title="Adjust credits"
          description="Positive amounts inject, negative amounts deduct (never below zero). Recorded as an immutable MANUAL_ADJUSTMENT ledger row."
          confirmLabel="Apply adjustment"
          successMessage="Credits adjusted"
          canSubmit={creditsValid}
          onSubmit={(reason, ticketRef) =>
            adminService.adjustCredits({
              target: creditTarget,
              targetId: creditTargetId.trim(),
              amountPaisa: paisaValue,
              reason,
              ticketRef,
            })
          }
          onClose={() => setAction(null)}
          onDone={() => void load()}
        >
          <div className="space-y-3">
            <select
              aria-label="Credit target"
              value={creditTarget}
              onChange={(event) => setCreditTarget(event.target.value as CreditTarget)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={CreditTarget.USER}>User balance</option>
              <option value={CreditTarget.TEAM}>Team pool</option>
            </select>
            <Input
              aria-label="Target ID"
              placeholder="User or team ID (UUID)"
              value={creditTargetId}
              onChange={(event) => setCreditTargetId(event.target.value)}
            />
            <Input
              aria-label="Amount in paisa"
              inputMode="numeric"
              placeholder="amountPaisa, e.g. 500000 or -100000"
              value={amountPaisa}
              onChange={(event) => setAmountPaisa(event.target.value)}
            />
          </div>
        </ReasonModal>
      )}

      {action === "extend" && (
        <ReasonModal
          title="Extend subscription"
          description="Adjust the billing period end and/or grace end. Cancelled and expired subscriptions cannot be extended."
          confirmLabel="Extend"
          successMessage="Subscription extended"
          canSubmit={extendValid}
          onSubmit={(reason, ticketRef) =>
            adminService.extendSubscription(subscriptionId.trim(), {
              currentPeriodEnd: toIso(periodEnd),
              gracePeriodEnd: toIso(graceEnd),
              reason,
              ticketRef,
            })
          }
          onClose={() => setAction(null)}
          onDone={() => void load()}
        >
          <div className="space-y-3">
            <Input
              aria-label="Subscription ID"
              placeholder="Subscription ID (UUID)"
              value={subscriptionId}
              onChange={(event) => setSubscriptionId(event.target.value)}
            />
            <label className="block text-sm" htmlFor="admin-period-end">
              Current period end
            </label>
            <Input
              id="admin-period-end"
              type="datetime-local"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
            <label className="block text-sm" htmlFor="admin-grace-end">
              Grace period end
            </label>
            <Input
              id="admin-grace-end"
              type="datetime-local"
              value={graceEnd}
              onChange={(event) => setGraceEnd(event.target.value)}
            />
          </div>
        </ReasonModal>
      )}
    </div>
  );
}
