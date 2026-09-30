import { useAuth } from "@/modules/auth/hooks/useAuth";
import { teamService } from "@/modules/teams/services";
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
import { Input } from "@/shared/components/ui/input";
import { Sidebar } from "@/shared/components/Sidebar";
import { apiErrorMessage } from "@/shared/utils/api-error";
import { FiCheck, FiX } from "react-icons/fi";
import React, { useState } from "react";
import { toast } from "react-toastify";
import { Link, useNavigate } from "react-router-dom";
import {
  PRO_PRICE_PAISA,
  TEAM_MAX_SEATS,
  TEAM_MIN_SEATS,
  TEAM_SEAT_PRICE_PAISA,
} from "../constants";
import { subscriptionService } from "../services";
import type { SubscriptionPaymentMethod } from "../types";
import type { PlanTier } from "../../auth/types";
import { clampSeats, formatPaisa, isPaidPlan } from "../utils";

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
  { label: "300 AI signals / month, then pay-as-you-go credits", included: true },
  { label: "Unlimited watchlist symbols", included: true },
  { label: "Full alert catalog", included: true },
  { label: "Decision support on any symbol", included: true },
  { label: "Live real-time quotes", included: true },
  { label: "Multiple portfolios + risk metrics", included: true },
  { label: "PDF exports", included: true },
  { label: "Priority support", included: true },
];

const TEAM_FEATURES: { label: string; included: boolean }[] = [
  { label: "Everything in Pro", included: true },
  { label: "375 AI signals / seat / month (1.25× Pro)", included: true },
  { label: "Shared credit pool with per-member limits", included: true },
  { label: "Shared watchlists, screeners & research notes", included: true },
  { label: "Workspace-wide AI instructions", included: true },
  { label: "Usage analytics & domain controls", included: true },
  { label: "Priority processing at market open/close", included: true },
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
  const { user, refreshMe, enablePaymentProcessor } = useAuth();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState<PlanTier | null>(null);
  const [seatInput, setSeatInput] = useState(TEAM_MIN_SEATS);
  const [teamName, setTeamName] = useState("");
  const currentPlan: PlanTier = user?.plan ?? "FREE";
  const onTeam = currentPlan === "TEAM";

  const seatCount = clampSeats(seatInput, TEAM_MIN_SEATS, TEAM_MAX_SEATS);
  const teamTotalPaisa = seatCount * TEAM_SEAT_PRICE_PAISA;

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

  // Upgrading to Pro with a live payment processor goes through Safepay's
  // hosted checkout — the plan only actually changes once the webhook
  // confirms payment (see PaymentResult.tsx). Downgrades and Bypass Mode
  // upgrades still go straight through /auth/plan via handleSelectPlan.
  const handleUpgradeWithMethod = async (paymentMethod: SubscriptionPaymentMethod) => {
    if (isPaidPlan(currentPlan) || updating) return;
    setUpdating("PRO");
    try {
      const { checkoutUrl } = await subscriptionService.createCheckout(paymentMethod);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start checkout");
      setUpdating(null);
    }
  };

  // Payment Mode: Safepay checkout (the workspace is created once the webhook
  // confirms payment). Bypass Mode: the workspace is created immediately.
  const handleCreateTeam = async () => {
    const name = teamName.trim();
    if (updating || onTeam) return;
    if (name.length < 2) {
      toast.error("Give your workspace a name (at least 2 characters)");
      return;
    }
    setUpdating("TEAM");
    try {
      if (enablePaymentProcessor) {
        const { checkoutUrl } = await subscriptionService.createCheckout(
          "CARD",
          "TEAM",
          seatCount,
          name,
        );
        window.location.href = checkoutUrl;
        return;
      }
      await teamService.createTeam(name, seatCount);
      await refreshMe();
      toast.success("Workspace created!");
      navigate("/teams");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create workspace"));
      setUpdating(null);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />

      <main id="main-content" className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto p-4 lg:p-8">
          <header className="mb-10 text-center">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Choose your plan
            </h1>
            <p className="text-muted-foreground mt-2">
              Switch anytime — no payment details required right now.
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  disabled={currentPlan === "FREE" || onTeam || updating !== null}
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
                  <span className="text-3xl font-bold text-foreground">
                    {formatPaisa(PRO_PRICE_PAISA)}
                  </span>
                  <span className="text-muted-foreground"> /month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <FeatureRow key={f.label} {...f} />
                  ))}
                </ul>
                {onTeam ? (
                  <Button type="button" className="w-full" disabled>
                    Included in your Team plan
                  </Button>
                ) : currentPlan === "PRO" ? (
                  enablePaymentProcessor ? (
                    <Button asChild className="w-full">
                      <Link to="/plans/manage">Manage Subscription</Link>
                    </Button>
                  ) : (
                    <Button type="button" className="w-full" disabled>
                      Current plan
                    </Button>
                  )
                ) : enablePaymentProcessor ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full"
                      disabled={updating !== null}
                      onClick={() => handleUpgradeWithMethod("CARD")}
                    >
                      Upgrade with Card
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={updating !== null}
                      onClick={() => handleUpgradeWithMethod("WALLET")}
                    >
                      Upgrade with JazzCash/Easypaisa
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={updating !== null}
                    onClick={() => handleSelectPlan("PRO")}
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Team</CardTitle>
                  {onTeam && <Badge>Current plan</Badge>}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {formatPaisa(TEAM_SEAT_PRICE_PAISA)}
                  </span>
                  <span className="text-muted-foreground"> /seat/month · min {TEAM_MIN_SEATS} seats</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {TEAM_FEATURES.map((f) => (
                    <FeatureRow key={f.label} {...f} />
                  ))}
                </ul>
                {onTeam ? (
                  <Button asChild className="w-full">
                    <Link to="/teams">Open Workspace</Link>
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="team-name" className="text-sm font-medium">
                        Workspace name
                      </label>
                      <Input
                        id="team-name"
                        value={teamName}
                        maxLength={80}
                        placeholder="e.g. Alpha Fund"
                        onChange={(e) => setTeamName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="team-seats" className="text-sm font-medium">
                        Seats ({TEAM_MIN_SEATS}–{TEAM_MAX_SEATS})
                      </label>
                      <Input
                        id="team-seats"
                        type="number"
                        min={TEAM_MIN_SEATS}
                        max={TEAM_MAX_SEATS}
                        value={seatInput}
                        onChange={(e) => setSeatInput(Number(e.target.value))}
                        onBlur={() => setSeatInput(seatCount)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-baseline justify-between rounded-lg bg-muted/50 p-3 text-sm">
                      <span className="text-muted-foreground">
                        {seatCount} × {formatPaisa(TEAM_SEAT_PRICE_PAISA)}
                      </span>
                      <span className="text-lg font-bold">{formatPaisa(teamTotalPaisa)}/mo</span>
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={updating !== null}
                      onClick={handleCreateTeam}
                    >
                      {enablePaymentProcessor ? "Continue to payment" : "Create workspace"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
