import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Mail, ArrowRight, RefreshCw, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import api from "@/shared/api/axios";
import { Skeleton } from "@/shared/components/ui/skeleton";

const schema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .trim()
    .toLowerCase(),
});

type Form = z.infer<typeof schema>;

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loading, user } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { register, handleSubmit, formState, getValues } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
    },
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
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
    }
  }, [user, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const sendLoginLink = async (email: string) => {
    setIsSubmitting(true);
    try {
      await api.post("/api/v1/auth/magic-link", { email });
      setSubmittedEmail(email);
      setResendCooldown(30); // 30s cooldown before resending
      toast.success("Magic link sent! Please check your inbox.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send magic link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: Form) => {
    await sendLoginLink(data.email);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !submittedEmail) return;
    await sendLoginLink(submittedEmail);
  };

  if (submittedEmail) {
    return (
      <AuthLayout
        loading={loading}
        title="Check your inbox"
        subtitle="We sent a one-time magic login link to your email."
      >
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 rounded-2xl bg-gradient-to-b from-gray-900/90 to-gray-950/90 border border-gray-800/80 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl"></div>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Mail className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Authentication Email Sent
                </p>
                <p className="text-sm font-bold text-white break-all">{submittedEmail}</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-gray-800/60 text-xs text-gray-300">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Click the link in your email to sign in instantly</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400" />
                <span>Link expires strictly in <strong>10 minutes</strong> and is single-use</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isSubmitting}
              className="w-full h-12 bg-gray-800 hover:bg-gray-700 text-white font-semibold text-sm border border-gray-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Skeleton className="w-4 h-4 rounded-full bg-white/20" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {resendCooldown > 0
                ? `Resend link in ${resendCooldown}s`
                : isSubmitting
                ? "Resending..."
                : "Resend email link"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setSubmittedEmail(null);
                setResendCooldown(0);
              }}
              className="w-full text-center text-xs text-gray-400 hover:text-cyan-400 transition-colors py-2"
            >
              Use a different email address
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      loading={loading}
      title="Sign in to StockPros"
      subtitle="Your intelligent companion for stock market analysis and forecasting"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-base font-semibold text-[#E2E8F0] tracking-wide mb-2.5">
            Email Address
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            error={formState.errors.email?.message}
            registration={register("email")}
            autoComplete="email"
            autoFocus
            label=""
            className="bg-gray-950/60 border-gray-800 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 h-12 transition-all w-full rounded-lg"
          />
        </div>

        <Button
          type="submit"
          disabled={formState.isSubmitting || isSubmitting}
          className="w-full h-12 mt-4 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-base shadow-lg shadow-cyan-950/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] border border-cyan-400/40 hover:border-cyan-400 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-black"
        >
          {formState.isSubmitting || isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Skeleton className="w-4 h-4 rounded-full bg-white/30" />
              <span>Sending link...</span>
            </div>
          ) : (
            <>
              <span>Continue with email</span>
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
};