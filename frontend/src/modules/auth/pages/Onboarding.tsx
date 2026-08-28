import { Skeleton } from "@/shared/components/ui/skeleton";
import { getApiErrorMessage } from "@/shared/utils/apiError";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import api from "../../../shared/api/axios";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAuth } from "../hooks/useAuth";

const schema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
});

type Form = z.infer<typeof schema>;

export const Onboarding: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refreshMe } = useAuth();

  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "" }
  });

  const onSubmit = async (data: Form) => {
    try {
      setLoading(true);
      setError(null);

      // Retrieve the onboarding token stored by Verify.tsx after email verification
      const onboardingToken = sessionStorage.getItem("onboarding_token");
      if (!onboardingToken) {
        setError("Your onboarding session has expired. Please request a new magic link.");
        return;
      }

      const response = await api.post('/api/v1/auth/onboarding', {
        ...data,
        onboardingToken,
      });

      // Store the access token returned by the server so refreshMe() can call /me
      if (response.data?.accessToken) {
        const { setAccessToken } = await import("@/shared/utils/token");
        setAccessToken(response.data.accessToken);
      }

      // Clear the one-time onboarding token
      sessionStorage.removeItem("onboarding_token");

      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Onboarding error:", err);
      setError(getApiErrorMessage(err, "Failed to complete onboarding. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      loading={loading}
      title="Welcome!"
      subtitle="Let's complete your profile."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label htmlFor="displayName" className="block text-base font-semibold text-[#E2E8F0] tracking-wide mb-2.5">
            Display Name
          </label>
          <Input
            id="displayName"
            type="text"
            placeholder="John Doe"
            error={formState.errors.displayName?.message}
            registration={register("displayName")}
            autoComplete="name"
            label=""
            className="bg-gray-950/60 border-gray-800 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 h-12 transition-all w-full rounded-lg"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={formState.isSubmitting || loading}
          className="w-full h-12 mt-4 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-base shadow-lg shadow-cyan-950/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] border border-cyan-400/40 hover:border-cyan-400 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-black"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Skeleton className="w-4 h-4 rounded-full bg-white/30" />
              <span>Saving...</span>
            </div>
          ) : "Continue to Dashboard"}
        </Button>
      </form>
    </AuthLayout>
  );
};
