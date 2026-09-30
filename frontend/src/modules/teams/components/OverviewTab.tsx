import { useAuth } from "@/modules/auth/hooks/useAuth";
import { QuotaMeter } from "@/modules/plans/components/QuotaMeter";
import { TopUpModal } from "@/modules/plans/components/TopUpModal";
import { subscriptionService } from "@/modules/plans/services";
import { formatPaisa } from "@/modules/plans/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useState } from "react";
import { toast } from "react-toastify";
import type { Team } from "../types";
import { apiErrorMessage, formatDate, isTeamAdmin } from "../utils";
import { AddSeatsModal } from "./AddSeatsModal";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { InstructionsEditor } from "./InstructionsEditor";
import { SeatGauge } from "./SeatGauge";

interface OverviewTabProps {
  team: Team;
  reload: () => void;
}

export function OverviewTab({ team, reload }: OverviewTabProps) {
  const { enablePaymentProcessor } = useAuth();
  const admin = isTeamAdmin(team.role);
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const handleRenew = async () => {
    if (renewing) return;
    setRenewing(true);
    try {
      const { checkoutUrl } = await subscriptionService.renewSubscription("TEAM");
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to start renewal"));
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-6">
      <QuotaMeter />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seats</CardTitle>
            <CardDescription>Active members and pending invites vs. capacity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SeatGauge seats={team.seats} />
            {admin && (
              <Button type="button" variant="outline" onClick={() => setSeatsOpen(true)}>
                Add seats
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credits & billing</CardTitle>
            <CardDescription>
              Shared pool used after each member&apos;s monthly AI quota
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-2xl font-bold">{formatPaisa(team.creditBalanceInPaisa)}</p>
              <p className="text-sm text-muted-foreground">credit balance</p>
            </div>
            {team.subscription && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={team.subscription.status === "ACTIVE" ? "default" : "secondary"}>
                  {team.subscription.status}
                </Badge>
                <span className="text-muted-foreground">
                  {team.subscription.status === "GRACE"
                    ? `Grace period ends ${formatDate(team.subscription.gracePeriodEnd)}`
                    : `Renews ${formatDate(team.subscription.currentPeriodEnd)}`}
                </span>
              </div>
            )}
            {admin && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setTopUpOpen(true)}>
                  Top up credits
                </Button>
                {enablePaymentProcessor && team.subscription && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={renewing}
                    onClick={handleRenew}
                  >
                    {renewing ? "Redirecting…" : "Renew workspace"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization instructions</CardTitle>
          <CardDescription>
            Added as context to AI forecasts and market analysis for everyone in the workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstructionsEditor
            key={team.orgInstructions ?? ""}
            initial={team.orgInstructions}
            canEdit={admin}
            onSaved={reload}
          />
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage analytics</CardTitle>
            <CardDescription>Signals, searches and credit spend this billing cycle</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsPanel />
          </CardContent>
        </Card>
      )}

      <AddSeatsModal
        isOpen={seatsOpen}
        onClose={() => setSeatsOpen(false)}
        currentCapacity={team.seats.capacity}
        onAdded={reload}
      />
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        reason="Credits are added to the shared workspace pool."
      />
    </div>
  );
}
