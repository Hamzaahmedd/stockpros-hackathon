import { Skeleton } from "@/shared/components/ui/skeleton";
import { setAccessToken } from "@/shared/utils/token";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import api from "../../../shared/api/axios";
import { notificationService } from "../../notifications/services";
import type {
  MarketInterest,
  NotificationPreferences,
} from "../../notifications/types";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAuth } from "../hooks/useAuth";
import {
  ALERT_CHANNEL_OPTIONS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  MARKET_TOPICS,
  SUGGESTED_SYMBOLS,
} from "../constants";
import type {
  NotificationPreferenceToggle,
  OnboardingFormValues,
  SuggestedSymbol,
} from "../types";
import { onboardingSchema } from "../validation";

type OnboardingStep = 1 | 2 | 3;

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starter watchlist state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([
    "NVDA",
    "AAPL",
    "MSFT",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [customSymbols, setCustomSymbols] = useState<SuggestedSymbol[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();

  const storedGoogleName =
    typeof window !== "undefined"
      ? sessionStorage.getItem("onboarding_display_name")
      : null;

  const { register, trigger, formState, getValues } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { displayName: user?.displayName || storedGoogleName || "" },
  });

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
  };

  const toggleMarketInterest = (interest: MarketInterest) => {
    setPreferences((current) => ({
      ...current,
      marketInterests: current.marketInterests.includes(interest)
        ? current.marketInterests.filter((item) => item !== interest)
        : [...current.marketInterests, interest],
    }));
  };

  const togglePreference = (key: NotificationPreferenceToggle) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleAddCustomSymbol = () => {
    const clean = searchQuery.trim().toUpperCase();
    if (!clean) return;

    if (!selectedSymbols.includes(clean)) {
      setSelectedSymbols((prev) => [...prev, clean]);
      const exists =
        SUGGESTED_SYMBOLS.some((s) => s.symbol === clean) ||
        customSymbols.some((s) => s.symbol === clean);
      if (!exists) {
        setCustomSymbols((prev) => [
          ...prev,
          {
            symbol: clean,
            name: "Custom Ticker",
            sector: "Watchlist",
            category: "all",
            hasAiForecast: true,
          },
        ]);
      }
    }
    setSearchQuery("");
  };

  // Pre-filter / tailor suggested tickers in Step 2 based on Step 1 chosen market interests
  const filteredSymbols = useMemo(() => {
    const allAvailable = [...SUGGESTED_SYMBOLS, ...customSymbols];
    const interests = preferences.marketInterests;

    // Map market interest IDs to symbol categories
    const matchingCategories = new Set<string>();
    if (interests.includes("ai_tech")) matchingCategories.add("tech");
    if (interests.includes("growth")) matchingCategories.add("growth");
    if (interests.includes("consumer")) matchingCategories.add("consumer");
    if (
      interests.includes("finance") ||
      interests.includes("energy") ||
      interests.includes("healthcare")
    ) {
      matchingCategories.add("index");
    }

    if (matchingCategories.size === 0) {
      return allAvailable;
    }

    const tailored = allAvailable.filter(
      (item) =>
        item.category === "all" ||
        matchingCategories.has(item.category) ||
        selectedSymbols.includes(item.symbol),
    );

    return tailored.length > 0 ? tailored : allAvailable;
  }, [customSymbols, preferences.marketInterests, selectedSymbols]);

  const handleNextFromStep1 = async () => {
    const valid = await trigger("displayName");
    if (valid) {
      setError(null);
      setStep(2);
    }
  };

  const handleNextFromStep2 = () => {
    setError(null);
    setStep(3);
  };

  const executeLaunch = async (skipWatchlist = false) => {
    try {
      setLoading(true);
      setError(null);

      const onboardingToken = sessionStorage.getItem("onboarding_token");
      const displayNameValue =
        getValues("displayName")?.trim() ||
        user?.displayName ||
        storedGoogleName ||
        "Trader";

      if (storedGoogleName) {
        sessionStorage.removeItem("onboarding_display_name");
      }

      // 1. Complete account onboarding if token is pending
      if (onboardingToken) {
        const response = await api.post("/api/v1/auth/onboarding", {
          displayName: displayNameValue,
          onboardingToken,
        });

        if (response.data?.accessToken) {
          setAccessToken(response.data.accessToken);
        }

        sessionStorage.removeItem("onboarding_token");
      }

      // 2. Persist notification and market preferences for this account.
      await notificationService.updatePreferences(preferences);

      // 3. Seed starter watchlist in database
      const tickersToSeed = skipWatchlist ? [] : selectedSymbols;
      if (tickersToSeed.length > 0) {
        await Promise.all(
          tickersToSeed.map((symbol) =>
            api.post("/api/v1/watchlist", { symbol }).catch(() => undefined),
          ),
        );
      }

      // 4. Update auth state and navigate to live terminal
      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(
        err.response?.data?.message ||
        "Failed to complete setup. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white flex flex-col justify-between relative overflow-hidden selection:bg-cyan-500/30">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-cyan-600/15 via-blue-600/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-40 left-10 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <img
            src="/stockpros-logo.png"
            alt="StockPros Logo"
            className="w-9 h-9 object-contain"
          />
          <span className="text-xl font-extrabold tracking-tight text-white">
            Stock<span className="text-cyan-400">Pros</span>
          </span>
        </div>

        {/* Phase Indicator Steps */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: "Identity" },
            { num: 2, label: "Watchlist" },
            { num: 3, label: "Launch" },
          ].map((s, idx) => (
            <React.Fragment key={s.num}>
              {idx > 0 && (
                <div
                  className={`w-4 sm:w-6 h-0.5 transition-colors ${step >= s.num ? "bg-cyan-500" : "bg-slate-800"
                    }`}
                />
              )}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s.num
                    ? "bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                    : step > s.num
                      ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      : "bg-slate-950 border border-slate-800 text-slate-500"
                    }`}
                >
                  {step > s.num ? <Check className="w-3 h-3" /> : s.num}
                </span>
                <span
                  className={`hidden sm:inline text-xs font-medium ${step === s.num
                    ? "text-cyan-300"
                    : step > s.num
                      ? "text-slate-300"
                      : "text-slate-500"
                    }`}
                >
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ── Main Content Card ───────────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col justify-center">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-2xl shadow-black/80">
          {error && (
            <div className="mb-6 text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl p-3 text-center">
              {error}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: IDENTITY & INTERESTS                                        */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Header & Title */}
              <div className="text-center max-w-xl mx-auto mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Identity & Interests
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Pick topics you care about to tailor your market feed
                </p>
              </div>

              {/* Display Name Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Display Name <span className="text-cyan-400">*</span>
                  </label>
                </div>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  error={formState.errors.displayName?.message}
                  registration={register("displayName")}
                  autoComplete="name"
                  label=""
                  className="bg-slate-950/80 border-slate-700/70 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 h-12 transition-all w-full rounded-xl text-sm px-4"
                />
              </div>

              {/* Market Sectors & Themes */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Market Sectors & Themes
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Select interests to pre-filter your starter tickers in the next step.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    Selected:{" "}
                    <strong className="text-cyan-300">
                      {preferences.marketInterests.length}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {MARKET_TOPICS.map((topic) => {
                    const active = preferences.marketInterests.includes(topic.id);
                    const Icon = topic.icon;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleMarketInterest(topic.id)}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 ${active
                          ? "border-cyan-400 bg-cyan-500/10 text-cyan-100 ring-1 ring-cyan-500/30"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700"
                          }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon className="w-4 h-4 shrink-0 text-cyan-300" />
                          <span className="text-xs font-semibold truncate">
                            {topic.name}
                          </span>
                        </span>
                        {active && (
                          <Check className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className="space-y-3 pt-6 border-t border-slate-800/80">
                <Button
                  type="button"
                  onClick={handleNextFromStep1}
                  className="w-full h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 border border-cyan-400/40 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <span>Continue to Starter Watchlist</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: STARTER WATCHLIST (DEDICATED SCREEN)                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Header & Title */}
              <div className="text-center max-w-xl mx-auto mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Starter Watchlist
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Select tickers to generate immediate AI forecasts
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Showing tailored tickers based on your interests
                  </span>
                  <span className="text-xs text-slate-400">
                    Selected:{" "}
                    <strong className="text-cyan-400 font-mono">
                      {selectedSymbols.length}
                    </strong>
                  </span>
                </div>

                {/* Custom Symbol Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search any ticker (e.g. AMD, PLTR, GOOGL)..."
                      value={searchQuery}
                      onChange={(e) =>
                        setSearchQuery(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomSymbol();
                        }
                      }}
                      className="w-full h-11 pl-10 pr-4 bg-slate-950/80 border border-slate-700/70 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomSymbol}
                    disabled={!searchQuery.trim()}
                    className="h-11 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Curated Ticker Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {filteredSymbols.map((item) => {
                    const active = selectedSymbols.includes(item.symbol);
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => toggleSymbol(item.symbol)}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${active
                          ? "border-cyan-400 bg-cyan-500/10 text-cyan-100 shadow-[0_0_12px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                          }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-sm text-white">
                              {item.symbol}
                            </span>
                            {item.hasAiForecast && (
                              <span className="rounded px-1 py-0.2 bg-cyan-500/10 border border-cyan-500/30 text-[8px] font-mono text-cyan-300 font-bold">
                                AI
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {item.name}
                          </p>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-all ${active
                            ? "bg-cyan-400 text-slate-950 font-bold shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                            : "border border-slate-700 text-slate-500 hover:border-slate-500"
                            }`}
                        >
                          {active ? (
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* AI Real-Time Forecast Banner */}
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                  <p className="text-xs text-cyan-200/90 leading-relaxed">
                    AI predictions and technical signals will automatically generate for your selected tickers
                  </p>
                </div>
              </div>

              {/* Step 2 Actions */}
              <div className="space-y-3 pt-6 border-t border-slate-800/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-12 px-4 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300 hover:text-white transition text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Back</span>
                  </button>
                  <Button
                    type="button"
                    onClick={handleNextFromStep2}
                    className="flex-1 h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 border border-cyan-400/40 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>Continue to Alert Preferences</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => executeLaunch(true)}
                  disabled={loading}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
                >
                  Skip starter watchlist and go straight to dashboard
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 3: ALERT PREFERENCES & LAUNCH                                 */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Header & Title */}
              <div className="text-center max-w-xl mx-auto mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Alert Preferences & Launch
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Configure real-time notifications
                </p>
              </div>

              {/* Alert Channels Selection */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Alert Channels
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    How would you like to receive updates?
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {ALERT_CHANNEL_OPTIONS.map((option) => {
                    const key = option.key;
                    const Icon = option.icon;
                    const active = preferences[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePreference(key)}
                        className={`p-3 rounded-xl border text-left transition duration-200 ${active
                          ? "border-cyan-400 bg-cyan-500/10 text-cyan-100 shadow-[0_0_12px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Icon className="w-4 h-4 text-cyan-300" />
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${active
                              ? "bg-cyan-400 text-slate-950 font-bold shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                              : "border border-slate-700 text-slate-500 hover:border-slate-500"
                              }`}
                          >
                            {active && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                        </div>
                        <p className="mt-3 text-xs font-bold text-white">
                          {option.title}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3 Actions */}
              <div className="space-y-3 pt-6 border-t border-slate-800/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={loading}
                    className="h-12 px-4 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300 hover:text-white transition text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Back</span>
                  </button>
                  <Button
                    type="button"
                    onClick={() => executeLaunch(false)}
                    disabled={loading}
                    className="flex-1 h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 border border-cyan-400/40 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-4 h-4 rounded-full bg-white/30" />
                        <span>Seeding Watchlist & Launching...</span>
                      </div>
                    ) : (
                      <>
                        <span>
                          Launch Dashboard ({selectedSymbols.length} Tickers)
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => executeLaunch(true)}
                  disabled={loading}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
                >
                  Skip starter watchlist and go straight to dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-6 py-4 space-y-2 border-t border-slate-900/80 text-[11px] text-slate-500">
        <div className="flex items-center justify-between gap-3">
          <span>
            &copy; {new Date().getFullYear()} StockPros. All rights reserved.
          </span>
        </div>
        <p className="text-slate-500 leading-relaxed">
          StockPros outputs are informational and educational only. They are not
          personalized financial, legal, tax, or fiduciary advice.
        </p>
      </footer>
    </div>
  );
};
