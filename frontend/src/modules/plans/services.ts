import api from "@/shared/api/axios";
import { readCheckoutRedirect, unwrapEnvelope } from "@/shared/api/envelope";
import type { TopupPackId } from "./constants";
import type {
  CreateCheckoutResult,
  CreditLedgerPage,
  SubscriptionPaymentMethod,
  SubscriptionScope,
  SubscriptionSummary,
  UsageSummary,
  VerifyTrackerResult,
} from "./types";

export const subscriptionService = {
  /**
   * PRO takes `paymentMethod`; TEAM additionally needs `seatCount` (2–150) and
   * `teamName` (the backend ignores `paymentMethod` for TEAM — team seats are
   * always a one-time checkout). Amounts are derived server-side.
   */
  createCheckout: async (
    paymentMethod: SubscriptionPaymentMethod,
    planTier: "PRO" | "TEAM" = "PRO",
    seatCount?: number,
    teamName?: string,
  ): Promise<CreateCheckoutResult> => {
    const res = await api.post("/api/v1/payments/create-checkout", {
      plan: planTier,
      paymentMethod,
      ...(seatCount !== undefined ? { seatCount } : {}),
      ...(teamName !== undefined ? { teamName } : {}),
    });
    return readCheckoutRedirect(res.data);
  },

  /** Prepaid credit top-up: credits the team pool for owners/admins, else the caller's own balance. */
  createTopupCheckout: async (packId: TopupPackId): Promise<CreateCheckoutResult> => {
    const res = await api.post("/api/v1/payments/create-checkout", {
      plan: "TOPUP",
      packId,
    });
    return readCheckoutRedirect(res.data);
  },

  verifyTracker: async (trackerId: string): Promise<VerifyTrackerResult> => {
    const res = await api.post("/api/v1/payments/verify-tracker", { trackerId });
    return res.data;
  },

  getSubscription: async (scope: SubscriptionScope = "USER"): Promise<SubscriptionSummary> => {
    const res = await api.get("/api/v1/payments/subscription", { params: { scope } });
    return res.data;
  },

  renewSubscription: async (scope: SubscriptionScope = "USER"): Promise<CreateCheckoutResult> => {
    const res = await api.post("/api/v1/payments/subscription/renew", undefined, {
      params: { scope },
    });
    return readCheckoutRedirect(res.data);
  },

  toggleAutoRenew: async (
    enabled: boolean,
    scope: SubscriptionScope = "USER",
  ): Promise<SubscriptionSummary> => {
    const res = await api.post("/api/v1/payments/subscription/auto-renew", {
      enabled,
      scope,
    });
    return res.data;
  },
};

export const creditService = {
  /** Newest-first credit history; `scope: "TEAM"` is the whole workspace pool (owner/admin only). */
  getLedger: async (
    scope: SubscriptionScope = "USER",
    cursor?: string,
  ): Promise<CreditLedgerPage> => {
    const res = await api.get("/api/v1/payments/credits/ledger", {
      params: { scope, ...(cursor ? { cursor } : {}) },
    });
    return unwrapEnvelope(res);
  },
};

export const usageService = {
  /** The caller's allowance this cycle: signals used vs. included, credit pool, and any spend cap. */
  getMyUsage: async (): Promise<UsageSummary> => {
    const res = await api.get("/api/v1/payments/me/usage");
    return unwrapEnvelope(res);
  },
};
