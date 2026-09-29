import api from "@/shared/api/axios";
import type {
  CreateCheckoutResult,
  SubscriptionPaymentMethod,
  SubscriptionSummary,
  VerifyTrackerResult,
} from "./types";

export const subscriptionService = {
  /**
   * `planTier`/`seatCount` are deliberately forward-looking for a future
   * non-PRO tier — the backend today only accepts `plan: 'PRO'` and ignores
   * unknown fields, so this is a no-op beyond PRO/CARD/WALLET for now.
   */
  createCheckout: async (
    paymentMethod: SubscriptionPaymentMethod,
    planTier: "PRO" | "TEAM" = "PRO",
    seatCount?: number,
  ): Promise<CreateCheckoutResult> => {
    const res = await api.post("/api/v1/payments/create-checkout", {
      plan: planTier,
      paymentMethod,
      ...(seatCount !== undefined ? { seatCount } : {}),
    });
    return res.data;
  },

  verifyTracker: async (trackerId: string): Promise<VerifyTrackerResult> => {
    const res = await api.post("/api/v1/payments/verify-tracker", { trackerId });
    return res.data;
  },

  getSubscription: async (): Promise<SubscriptionSummary> => {
    const res = await api.get("/api/v1/payments/subscription");
    return res.data;
  },

  renewSubscription: async (): Promise<CreateCheckoutResult> => {
    const res = await api.post("/api/v1/payments/subscription/renew");
    return res.data;
  },

  toggleAutoRenew: async (enabled: boolean): Promise<SubscriptionSummary> => {
    const res = await api.post("/api/v1/payments/subscription/auto-renew", {
      enabled,
    });
    return res.data;
  },
};
