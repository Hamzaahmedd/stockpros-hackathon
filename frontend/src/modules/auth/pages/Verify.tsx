import { Skeleton } from "@/shared/components/ui/skeleton";
import { setAccessToken } from "@/shared/utils/token";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../../shared/api/axios";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";

const verifiedTokens = new Set<string>();

export const VerifyMagicLink = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No authentication token was found in the link. Please request a new login link.");
      return;
    }

    // Prevent duplicate API calls for the same token
    if (verifiedTokens.has(token)) {
      return;
    }
    verifiedTokens.add(token);

    const verify = async () => {
      try {
        const response = await api.post("/api/v1/auth/verify-magic-link", { token });
        const { requiresOnboarding, onboardingToken, accessToken, user } = response.data;

        // New user — backend verified the email but needs profile setup first
        if (requiresOnboarding && onboardingToken) {
          sessionStorage.setItem("onboarding_token", onboardingToken);
          setIsSuccess(true);
          setTimeout(() => {
            navigate("/auth/onboarding", { replace: true });
          }, 800);
          return;
        }

        // Existing user — store access token and refresh auth context
        if (accessToken) {
          setAccessToken(accessToken);
        }

        await refreshMe();
        setIsSuccess(true);

        // Determine destination based on user profile and role
        setTimeout(() => {
          if (!user?.displayName || user.displayName.trim() === "") {
            navigate("/auth/onboarding", { replace: true });
            return;
          }

          const roles =
            user.userRoles?.map((ur: any) => (ur?.role?.name || ur?.name || "").toUpperCase()) ||
            user.roles?.map((r: any) => (typeof r === "string" ? r : r?.name || "").toUpperCase()) ||
            [];

          const isAdmin = roles.includes("ADMIN");
          const isPortfolioManager =
            roles.includes("PORTFOLIO_MANAGER") ||
            roles.includes("PORTFOLIO MANAGER") ||
            roles.includes("PORTFOLIO");
          const isAnalyst =
            roles.includes("ANALYST") || roles.includes("ANALYST_ROLE") || roles.includes("ANALYST ROLE");
          const isAdminOnly = isAdmin && !isPortfolioManager && !isAnalyst;

          if (isAdminOnly) {
            navigate("/access-control/users", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }, 800);
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            "Authentication failed. The login link may be invalid, already used, or expired."
        );
      }
    };

    verify();
  }, [token, navigate, refreshMe]);

  if (error) {
    return (
      <AuthLayout
        title="Authentication Failed"
        subtitle="We could not verify your login link."
      >
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-red-950/30 border border-red-900/50 shadow-xl flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">Link Invalid or Expired</p>
              <p className="text-xs text-red-300 leading-relaxed">{error}</p>
            </div>
          </div>

          <Link to="/login" className="block w-full">
            <Button className="w-full h-12 bg-[#0047AB] hover:bg-[#003385] text-white font-bold text-sm shadow-lg shadow-blue-900/40 border-none transition-all flex items-center justify-center gap-2">
              <span>Request a new login link</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isSuccess) {
    return (
      <AuthLayout
        title="Authenticated!"
        subtitle="Redirecting you into StockPros terminal..."
      >
        <div className="flex flex-col items-center justify-center py-10 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <p className="text-sm text-gray-300">Session verified successfully.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verifying Security Token..."
      subtitle="Please wait while we establish your authenticated session."
    >
      <div className="flex flex-col items-center justify-center py-12 space-y-5">
        <div className="relative">
          <Skeleton className="w-14 h-14 rounded-full" />
        </div>
        <p className="text-xs text-cyan-400 font-mono tracking-wider uppercase animate-pulse">
          Validating SHA-256 Signature...
        </p>
      </div>
    </AuthLayout>
  );
};
