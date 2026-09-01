import { Skeleton } from "@/shared/components/ui/skeleton";
import { setAccessToken } from "@/shared/utils/token";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Cpu,
  FileText,
  Gem,
  Landmark,
  Mail,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
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

interface MarketTopic {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
}

const MARKET_TOPICS: MarketTopic[] = [
  { id: "ai_tech", name: "AI & Tech", icon: Cpu, description: "Semiconductors, LLMs, cloud" },
  { id: "energy", name: "Energy", icon: Zap, description: "Oil, gas, clean renewables" },
  { id: "finance", name: "Finance", icon: Landmark, description: "Banks, fintech, payments" },
  { id: "healthcare", name: "Healthcare", icon: Activity, description: "Biotech, medtech, pharma" },
  { id: "growth", name: "Growth Stocks", icon: TrendingUp, description: "High-momentum tech & SaaS" },
  { id: "crypto", name: "Crypto & Web3", icon: Sparkles, description: "Digital assets & blockchain" },
  { id: "consumer", name: "Consumer", icon: ShoppingBag, description: "Retail, e-commerce, staples" },
  { id: "value", name: "Value Stocks", icon: Gem, description: "Dividend aristocrats & leaders" },
];

const SUGGESTED_SYMBOLS = [
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", hasAiForecast: true },
  { symbol: "AAPL", name: "Apple Inc.", sector: "Consumer Tech", hasAiForecast: true },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Cloud & AI", hasAiForecast: true },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "EV & AI", hasAiForecast: true },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "E-Commerce & Cloud", hasAiForecast: true },
  { symbol: "META", name: "Meta Platforms", sector: "Digital Media & AI", hasAiForecast: true },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Entertainment", hasAiForecast: false },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", sector: "Index ETF", hasAiForecast: true },
];

interface AlertOption {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  recommended?: boolean;
}

const ALERT_OPTIONS: AlertOption[] = [
  {
    id: "in_app",
    title: "In-App Real-Time Alerts",
    description: "Instant pop-up triggers when prices cross key levels or AI signals fire.",
    icon: Bell,
    recommended: true,
  },
  {
    id: "email_alerts",
    title: "Email Volatility Alerts",
    description: "Direct email notifications for critical stop-loss or take-profit breaches.",
    icon: Mail,
    recommended: false,
  },
  {
    id: "daily_digest",
    title: "Daily Pre-Market Digest",
    description: "Curated AI summary of news, sector trends, and your watchlist before market open.",
    icon: FileText,
    recommended: true,
  },
];

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User selections
  const [selectedTopics, setSelectedTopics] = useState<string[]>(["AI & Tech", "Growth Stocks"]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["NVDA", "AAPL", "MSFT"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>(["in_app", "daily_digest"]);

  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();

  const storedGoogleName =
    typeof window !== "undefined" ? sessionStorage.getItem("onboarding_display_name") : null;

  const { register, handleSubmit, formState, getValues, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: user?.displayName || storedGoogleName || "" },
  });

  const toggleTopic = (topicName: string) => {
    setSelectedTopics((current) =>
      current.includes(topicName)
        ? current.filter((item) => item !== topicName)
        : [...current, topicName],
    );
  };

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
  };

  const handleAddCustomSymbol = () => {
    const clean = searchQuery.trim().toUpperCase();
    if (!clean) return;
    if (!selectedSymbols.includes(clean)) {
      setSelectedSymbols((prev) => [...prev, clean]);
      if (!SUGGESTED_SYMBOLS.some((s) => s.symbol === clean) && !customSymbols.includes(clean)) {
        setCustomSymbols((prev) => [...prev, clean]);
      }
    }
    setSearchQuery("");
  };

  const toggleAlert = (alertId: string) => {
    setSelectedAlerts((current) =>
      current.includes(alertId)
        ? current.filter((item) => item !== alertId)
        : [...current, alertId],
    );
  };

  const finishOnboarding = async (skipAll = false) => {
    try {
      setLoading(true);
      setError(null);

      const onboardingToken = sessionStorage.getItem("onboarding_token");
      const displayNameValue = getValues("displayName") || user?.displayName || storedGoogleName || "Trader";

      if (storedGoogleName) {
        sessionStorage.removeItem("onboarding_display_name");
      }

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

      const finalTopics = skipAll ? ["AI & Tech", "Growth Stocks"] : selectedTopics;
      const finalSymbols = skipAll ? ["NVDA", "AAPL", "MSFT"] : selectedSymbols;
      const finalAlerts = skipAll ? ["in_app", "daily_digest"] : selectedAlerts;

      localStorage.setItem("stockpros_market_interests", JSON.stringify(finalTopics));
      localStorage.setItem("stockpros_alert_preferences", JSON.stringify(finalAlerts));

      if (finalSymbols.length > 0) {
        await Promise.all(
          finalSymbols.map((symbol) =>
            api.post("/api/v1/watchlist", { symbol }).catch(() => undefined),
          ),
        );
      }

      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err.response?.data?.message || "Failed to complete setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Submit = (data: Form) => {
    setValue("displayName", data.displayName);
    setStep(2);
  };

  const titles: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: "Welcome to StockPros",
      subtitle: "Set up your market view and personal terminal in 30 seconds.",
    },
    2: {
      title: "Add to Starter Watchlist",
      subtitle: "Pick tickers to monitor. StockPros AI will track signals and price moves.",
    },
    3: {
      title: "Alert Preferences",
      subtitle: "Choose how you want market intelligence and volatility alerts delivered.",
    },
  };

  return (
    <AuthLayout
      loading={loading}
      title={titles[step].title}
      subtitle={titles[step].subtitle}
    >
      {/* 3-Step Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <span>Step {step} of 3</span>
          <span className="text-cyan-400 font-mono">
            {step === 1 && "Interests & Identity"}
            {step === 2 && "Watchlist & AI"}
            {step === 3 && "Launch"}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2.5">
          {error}
        </div>
      )}

      {/* ─── SCREEN 1: Welcome, Identity & Market Interests ──────────────────── */}
      {step === 1 && (
        <form onSubmit={handleSubmit(handleStep1Submit)} className="space-y-5">
          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-semibold uppercase tracking-wider text-[#E2E8F0] mb-1.5"
            >
              Your Name
            </label>
            <Input
              id="displayName"
              type="text"
              placeholder="e.g. Alex Morgan"
              error={formState.errors.displayName?.message}
              registration={register("displayName")}
              autoComplete="name"
              label=""
              className="bg-gray-950/60 border-gray-800 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 h-11 transition-all w-full rounded-lg text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Market Interests <span className="text-cyan-400 lowercase font-normal">(optional)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Selected: <strong className="text-cyan-300">{selectedTopics.length}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
              {MARKET_TOPICS.map((topic) => {
                const active = selectedTopics.includes(topic.name);
                const Icon = topic.icon;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => toggleTopic(topic.name)}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between gap-2 ${
                      active
                        ? "border-cyan-400 bg-cyan-950/40 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/40"
                        : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className={`p-1.5 rounded-lg shrink-0 ${active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-white truncate">{topic.name}</span>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/40 border border-cyan-400/40 transition-all flex items-center justify-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <button
              type="button"
              onClick={() => finishOnboarding(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
            >
              Skip setup and go straight to dashboard
            </button>
          </div>
        </form>
      )}

      {/* ─── SCREEN 2: Add Stocks to Starter Watchlist ─────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Quick Symbol Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol (e.g. AMD, GOOGL)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomSymbol();
                  }
                }}
                className="w-full h-10 pl-9 pr-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddCustomSymbol}
              disabled={!searchQuery.trim()}
              className="h-10 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {/* Popular Tickers List */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Popular Stocks & ETFs
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
              {[...SUGGESTED_SYMBOLS, ...customSymbols.map((s) => ({ symbol: s, name: "Custom Ticker", sector: "Watchlist", hasAiForecast: true }))].map((item) => {
                const active = selectedSymbols.includes(item.symbol);
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => toggleSymbol(item.symbol)}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${
                      active
                        ? "border-emerald-400 bg-emerald-950/40 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.15)] ring-1 ring-emerald-400/40"
                        : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sm text-white">{item.symbol}</span>
                        {item.hasAiForecast && (
                          <span className="rounded px-1 py-0.2 bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-mono text-cyan-300">
                            AI
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate max-w-[110px]">{item.name}</p>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        active
                          ? "bg-emerald-500 text-black font-bold"
                          : "border border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {active ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Teaser Badge */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-200/90 leading-tight">
              Selected <strong className="text-white font-bold">{selectedSymbols.length}</strong> symbols. StockPros neural forecasting model will compute price projections upon entering.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-1.5 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <Button
                type="button"
                onClick={() => setStep(3)}
                className="flex-1 h-11 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            <button
              type="button"
              onClick={() => finishOnboarding(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ─── SCREEN 3: Alert Preferences + Launch ───────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-4 space-y-3 shadow-xl shadow-cyan-950/20">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Configuration Complete</p>
                <p className="text-xs text-slate-400">Your AI market workspace is primed.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400">Market Interests:</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedTopics.map((t) => (
                    <span key={t} className="rounded-md bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-cyan-300 font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Starter Watchlist:</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedSymbols.map((s) => (
                    <span key={s} className="rounded-md bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-emerald-300 font-mono font-bold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ALERT_OPTIONS.map((opt) => {
              const active = selectedAlerts.includes(opt.id);
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleAlert(opt.id)}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all duration-200 flex items-start gap-3.5 ${
                    active
                      ? "border-cyan-400 bg-cyan-950/30 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.1)] ring-1 ring-cyan-400/30"
                      : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-white flex items-center gap-2">
                        {opt.title}
                        {opt.recommended && (
                          <span className="rounded px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-[9px] text-blue-300 font-semibold">
                            Recommended
                          </span>
                        )}
                      </p>
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center transition ${
                          active ? "bg-cyan-500 text-black font-bold" : "border border-slate-700 text-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            You can customize granular alert thresholds or mute channels anytime in Settings.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-1.5 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <Button
                type="button"
                onClick={() => finishOnboarding(false)}
                disabled={loading}
                className="flex-1 h-11 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded-full bg-white/30" />
                    <span>Launching...</span>
                  </div>
                ) : (
                  <>
                    <span>Go to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => finishOnboarding(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};
