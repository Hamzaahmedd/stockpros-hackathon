import { Sidebar } from "@/shared/components/Sidebar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Switch } from "@/shared/components/ui/switch";
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCreditCard, FiSmartphone } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { subscriptionService } from "../services";
import type { SubscriptionSummary } from "../types";

const formatDate = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default function ManageSubscription() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const [renewing, setRenewing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    subscriptionService
      .getSubscription()
      .then((result) => {
        if (!cancelled) setSubscription(result);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleAutoRenew = async (next: boolean) => {
    if (!subscription || togglingAutoRenew) return;
    const previous = subscription;
    setSubscription({ ...subscription, autoRenew: next });
    setTogglingAutoRenew(true);
    try {
      const updated = await subscriptionService.toggleAutoRenew(next);
      setSubscription(updated);
    } catch (err: any) {
      setSubscription(previous);
      toast.error(err?.response?.data?.message || "Failed to update auto-renewal");
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  const handleRenew = async () => {
    if (renewing) return;
    setRenewing(true);
    try {
      const { checkoutUrl } = await subscriptionService.renewSubscription();
      window.location.href = checkoutUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start renewal");
      setRenewing(false);
    }
  };

  const handleRecoveryRenew = async () => {
    if (!subscription || renewing) return;
    setRenewing(true);
    try {
      const { checkoutUrl } = await subscriptionService.createCheckout(
        subscription.paymentMethod,
      );
      window.location.href = checkoutUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start renewal");
      setRenewing(false);
    }
  };

  const isAtRisk =
    !!subscription &&
    (subscription.status === "GRACE" ||
      (subscription.paymentMethod === "CARD" && !subscription.autoRenew));

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main id="main-content" className="flex-1 overflow-y-auto">
        <div className="max-w-[700px] mx-auto p-4 lg:p-8">
          <header className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Manage Subscription
            </h1>
            <p className="text-muted-foreground mt-2">
              View your billing status and renewal settings.
            </p>
          </header>

          {loading && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-9 w-40" />
              </CardContent>
            </Card>
          )}

          {!loading && notFound && (
            <Card>
              <CardContent className="p-6 text-center space-y-4">
                <p className="text-muted-foreground">
                  You don't have an active Pro subscription.
                </p>
                <Button onClick={() => navigate("/plans")}>View plans</Button>
              </CardContent>
            </Card>
          )}

          {!loading && !notFound && subscription && (
            <div className="space-y-4">
              {isAtRisk && (
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <FiAlertTriangle className="text-destructive text-xl shrink-0" />
                      <p className="text-sm">
                        Your Pro access ends on{" "}
                        <strong>
                          {formatDate(
                            subscription.gracePeriodEnd ?? subscription.currentPeriodEnd,
                          )}
                        </strong>{" "}
                        unless you renew.
                      </p>
                    </div>
                    <Button
                      onClick={handleRecoveryRenew}
                      disabled={renewing}
                      className="shrink-0"
                    >
                      {renewing ? "Redirecting…" : "Renew Access for 30 Days"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                      {subscription.paymentMethod === "CARD" ? (
                        <FiCreditCard />
                      ) : (
                        <FiSmartphone />
                      )}
                      Pro Plan
                    </CardTitle>
                    <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"}>
                      {subscription.status === "GRACE" ? "Grace Period" : subscription.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {subscription.paymentMethod === "CARD"
                      ? "Billed via saved card"
                      : "Billed via JazzCash/Easypaisa"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {subscription.paymentMethod === "CARD" ? (
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium text-sm">Auto-renew</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {subscription.autoRenew
                            ? `Renews automatically on ${formatDate(subscription.currentPeriodEnd)}`
                            : `Access ends on ${formatDate(subscription.currentPeriodEnd)} unless you turn auto-renewal back on`}
                        </p>
                      </div>
                      <Switch
                        checked={subscription.autoRenew}
                        onCheckedChange={handleToggleAutoRenew}
                        disabled={togglingAutoRenew}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium text-sm">Access period</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Access ends on {formatDate(subscription.currentPeriodEnd)}
                        </p>
                      </div>
                      <Button onClick={handleRenew} disabled={renewing}>
                        {renewing ? "Redirecting…" : "Renew for 30 Days"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
