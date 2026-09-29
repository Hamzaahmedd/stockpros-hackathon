export type SubscriptionPaymentMethod = "CARD" | "WALLET";

export type SubscriptionStatus = "ACTIVE" | "GRACE" | "EXPIRED" | "CANCELLED";

export type SubscriptionSummary = {
  paymentMethod: SubscriptionPaymentMethod;
  autoRenew: boolean;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  trackerId: string;
};

export type VerifyTrackerResult = {
  trackerId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  plan: "FREE" | "PRO";
};
