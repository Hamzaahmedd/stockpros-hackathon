import { useAuth } from "@/modules/auth/hooks/useAuth";
import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Sidebar } from "@/shared/components/Sidebar";
import { FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type ResultState = "checking" | "completed" | "pending" | "failed";

export default function PaymentResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [state, setState] = useState<ResultState>("checking");

  const trackerId = searchParams.get("tracker_id");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!trackerId) {
        setState("failed");
        return;
      }

      try {
        const res = await api.post("/api/v1/payments/verify-tracker", { trackerId });
        const status = res.data?.status;
        if (cancelled) return;

        if (status === "COMPLETED") {
          await refreshMe();
          setState("completed");
        } else if (status === "FAILED" || status === "CANCELLED") {
          setState("failed");
        } else {
          // Webhook may not have landed yet — the transaction stays PENDING
          // briefly after the browser redirect. One retry after a short
          // delay is enough for the common case without polling forever.
          setTimeout(async () => {
            if (cancelled) return;
            const retryRes = await api.post("/api/v1/payments/verify-tracker", { trackerId });
            if (cancelled) return;
            const retryStatus = retryRes.data?.status;
            if (retryStatus === "COMPLETED") {
              await refreshMe();
              setState("completed");
            } else if (retryStatus === "FAILED" || retryStatus === "CANCELLED") {
              setState("failed");
            } else {
              setState("pending");
            }
          }, 3000);
        }
      } catch {
        if (!cancelled) setState("failed");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerId]);

  const content = {
    checking: {
      icon: <FiClock className="text-muted-foreground text-4xl" />,
      title: "Confirming your payment...",
      message: "This should only take a moment.",
    },
    completed: {
      icon: <FiCheckCircle className="text-primary text-4xl" />,
      title: "Welcome to Pro!",
      message: "Your payment was confirmed and your account has been upgraded.",
    },
    pending: {
      icon: <FiClock className="text-muted-foreground text-4xl" />,
      title: "Payment pending",
      message: "We're still waiting for confirmation from Safepay. This page will update automatically once it lands.",
    },
    failed: {
      icon: <FiXCircle className="text-destructive text-4xl" />,
      title: "Payment not completed",
      message: "Your payment was cancelled or could not be confirmed. No charge was applied.",
    },
  }[state];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="flex flex-col items-center gap-4">
            {content.icon}
            <CardTitle>{content.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm">{content.message}</p>
            <div className="flex gap-3 justify-center">
              {state === "failed" && (
                <Button variant="outline" onClick={() => navigate("/plans")}>
                  Back to plans
                </Button>
              )}
              {(state === "completed" || state === "pending") && (
                <Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
