import { useEffect, useState } from "react";
import { getLoginAuthPolicy } from "../services";
import { DomainAuthPolicy } from "../types";
import { loginSchema } from "../validation";

const LOOKUP_DEBOUNCE_MS = 400;

/**
 * The sign-in policy of the typed email's domain. Looks up only once the email
 * is valid and typing has paused; a response for an earlier email is dropped.
 */
export const useLoginAuthPolicy = (email: string): DomainAuthPolicy => {
  const [result, setResult] = useState<{ email: string; policy: DomainAuthPolicy } | null>(null);

  useEffect(() => {
    const parsed = loginSchema.safeParse({ email });
    if (!parsed.success) return;
    const normalized = parsed.data.email;
    let stale = false;
    const timer = setTimeout(() => {
      void getLoginAuthPolicy(normalized).then((policy) => {
        if (!stale) setResult({ email: normalized, policy });
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [email]);

  const parsed = loginSchema.safeParse({ email });
  return parsed.success && result?.email === parsed.data.email
    ? result.policy
    : DomainAuthPolicy.ANY;
};
