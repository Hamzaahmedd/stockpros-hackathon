import { useAuth } from "@/modules/auth/hooks/useAuth";
import api from "@/shared/api/axios";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Sidebar } from "@/shared/components/Sidebar";
import { FiCheck, FiX } from "react-icons/fi";
import React, { useState } from "react";
import { toast } from "react-toastify";
import type { PlanTier } from "../../auth/types";

const FREE_FEATURES: { label: string; included: boolean }[] = [
  { label: "Up to 10 watchlist symbols", included: true },
  { label: "Price & % alerts", included: true },
  { label: "1 AI forecast / day", included: true },
  { label: "Decision support on watchlist symbols only", included: true },
  { label: "Quotes refresh every 15 minutes", included: true },
  { label: "1 portfolio, no risk metrics", included: true },
  { label: "PDF exports", included: false },
  { label: "Advanced alert types", included: false },
];

const PRO_FEATURES: { label: string; included: boolean }[] = [
  { label: "Unlimited watchlist symbols", included: true },
  { label: "Full alert catalog", included: true },
  { label: "Unlimited AI forecasts", included: true },
  { label: "Decision support on any symbol", included: true },
  { label: "Live real-time quotes", included: true },
  { label: "Multiple portfolios + risk metrics", included: true },
  { label: "PDF exports", included: true },
  { label: "Priority support", included: true },
];

function FeatureRow({ label, included }: { label: string; included: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {included ? (
        <FiCheck className="text-primary shrink-0" />
      ) : (
        <FiX className="text-muted-foreground/50 shrink-0" />
      )}
      <span className={included ? "text-foreground" : "text-muted-foreground/60 line-through"}>
        {label}
      </span>
    </li>
  );
}

export default function Plans() {
  const { user, refreshMe } = useAuth();
  const [updating, setUpdating] = useState<PlanTier | null>(null);
  const currentPlan: PlanTier = user?.plan ?? "FREE";

  const handleSelectPlan = async (plan: PlanTier) => {
    if (plan === currentPlan || updating) return;
    setUpdating(plan);
    try {
      await api.post("/api/v1/auth/plan", { plan });
      await refreshMe();
      toast.success(
        plan === "PRO" ? "Welcome to Pro!" : "Switched back to the Free plan"
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update plan");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />

      <main id="main-content" className="flex-1 overflow-y-auto">
        <div className="max-w-[1000px] mx-auto p-4 lg:p-8">
          <header className="mb-10 text-center">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Choose your plan
            </h1>
            <p className="text-muted-foreground mt-2">
              Switch anytime — no payment details required right now.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Free</CardTitle>
                  {currentPlan === "FREE" && <Badge variant="secondary">Current plan</Badge>}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">Rs 0</span>
                  <span className="text-muted-foreground"> /month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {FREE_FEATURES.map((f) => (
                    <FeatureRow key={f.label} {...f} />
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={currentPlan === "FREE" || updating !== null}
                  onClick={() => handleSelectPlan("FREE")}
                >
                  {currentPlan === "FREE" ? "Current plan" : "Switch to Free"}
                </Button>
              </CardContent>
            </Card>

            <Card className="relative border-primary shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Pro</CardTitle>
                  {currentPlan === "PRO" && <Badge>Current plan</Badge>}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">Rs 5,999</span>
                  <span className="text-muted-foreground"> /month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <FeatureRow key={f.label} {...f} />
                  ))}
                </ul>
                <Button
                  type="button"
                  className="w-full"
                  disabled={currentPlan === "PRO" || updating !== null}
                  onClick={() => handleSelectPlan("PRO")}
                >
                  {currentPlan === "PRO" ? "Current plan" : "Upgrade to Pro"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
