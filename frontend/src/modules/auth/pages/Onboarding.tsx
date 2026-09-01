import { Skeleton } from "@/shared/components/ui/skeleton";
import { setAccessToken } from "@/shared/utils/token";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
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
  Zap
} from "lucide-react";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import api from "../../../shared/api/axios";
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
          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            Terminal Setup
          </span>
        </div>

        {/* Top Step Breadcrumb */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                step === s
                  ? "bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                  : step > s
                  ? "bg-emerald-950/50 border border-emerald-500/30 text-emerald-400"
                  : "bg-slate-900/50 border border-slate-800 text-slate-500"
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === s ? "bg-cyan-500 text-black" : step > s ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-400"
              }`}>
                {step > s ? "✓" : s}
              </span>
              <span className="hidden sm:inline">
                {s === 1 && "Identity & Sectors"}
                {s === 2 && "Watchlist"}
                {s === 3 && "Alerts"}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Main Centered Card ──────────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col justify-center">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-2xl shadow-black/80">
          
          {/* Header & Title */}
          <div className="text-center max-w-xl mx-auto mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {titles[step].title}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {titles[step].subtitle}
            </p>

            {/* Progress line */}
            <div className="mt-5 h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="mb-6 text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl p-3 text-center">
              {error}
            </div>
          )}

          {/* ─── SCREEN 1: Welcome, Identity & Market Interests ──────────────────── */}
          {step === 1 && (
            <form onSubmit={handleSubmit(handleStep1Submit)} className="space-y-6">
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2"
                >
                  Your Display Name <span className="text-cyan-400">*</span>
                </label>
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

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Sectors & Market Interests <span className="text-cyan-400 lowercase font-normal">(select what you track)</span>
                  </label>
                  <span className="text-xs text-slate-400">
                    Selected: <strong className="text-cyan-300">{selectedTopics.length}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {MARKET_TOPICS.map((topic) => {
                    const active = selectedTopics.includes(topic.name);
                    const Icon = topic.icon;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.name)}
                        className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between gap-3 ${
                          active
                            ? "border-cyan-400 bg-cyan-950/40 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/40"
                            : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className={`p-2 rounded-lg ${active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {active && <Check className="w-4 h-4 text-cyan-400" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{topic.name}</p>
                          <p className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-1">{topic.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 border border-cyan-400/40 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <span>Continue to Watchlist Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <button
                  type="button"
                  onClick={() => finishOnboarding(true)}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition py-1"
                >
                  Skip setup and go straight to terminal
                </button>
              </div>
            </form>
          )}

          {/* ─── SCREEN 2: Add Stocks to Starter Watchlist ─────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Quick Symbol Search */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search custom symbol (e.g. AMD, GOOGL, COIN)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
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
                  className="h-11 px-5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  Add Ticker
                </button>
              </div>

              {/* Popular Tickers Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Suggested Stocks & ETFs
                  </p>
                  <span className="text-xs text-slate-400">
                    Selected: <strong className="text-emerald-400">{selectedSymbols.length} tickers</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto pr-1">
                  {[...SUGGESTED_SYMBOLS, ...customSymbols.map((s) => ({ symbol: s, name: "Custom Ticker", sector: "Watchlist", hasAiForecast: true }))].map((item) => {
                    const active = selectedSymbols.includes(item.symbol);
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => toggleSymbol(item.symbol)}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${
                          active
                            ? "border-emerald-400 bg-emerald-950/40 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.15)] ring-1 ring-emerald-400/40"
                            : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-sm text-white">{item.symbol}</span>
                            {item.hasAiForecast && (
                              <span className="rounded px-1 py-0.2 bg-cyan-500/10 border border-cyan-500/30 text-[8px] font-mono text-cyan-300 font-bold">
                                AI
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.name}</p>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center transition-all ${
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
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3.5 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Selected <strong className="text-white font-bold">{selectedSymbols.length}</strong> symbols. StockPros neural forecasting models will automatically initiate live price forecasting upon launch.
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-12 px-6 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-2 text-sm font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <Button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <span>Continue to Alert Preferences</span>
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {ALERT_OPTIONS.map((opt) => {
                  const active = selectedAlerts.includes(opt.id);
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleAlert(opt.id)}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between gap-3 ${
                        active
                          ? "border-cyan-400 bg-cyan-950/30 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.1)] ring-1 ring-cyan-400/30"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className={`p-2 rounded-lg ${active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center transition ${
                              active ? "bg-cyan-500 text-black font-bold" : "border border-slate-700 text-transparent"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <p className="text-xs font-bold text-white flex items-center gap-1.5">
                          {opt.title}
                          {opt.recommended && (
                            <span className="rounded px-1.5 py-0.2 bg-blue-500/10 border border-blue-500/30 text-[9px] text-blue-300 font-semibold">
                              Rec
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 text-center">
                You can customize granular alert thresholds or mute channels anytime in Terminal Settings.
              </p>

              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="h-12 px-6 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-2 text-sm font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <Button
                    type="button"
                    onClick={() => finishOnboarding(false)}
                    disabled={loading}
                    className="flex-1 h-12 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 hover:from-blue-600 hover:via-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-4 h-4 rounded-full bg-white/30" />
                        <span>Launching Terminal...</span>
                      </div>
                    ) : (
                      <>
                        <span>Complete Setup & Go to Dashboard</span>
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
        </div>
      </main>

      {/* ── Minimal Footer ─────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-6 py-4 space-y-2 border-t border-slate-900/80 text-[11px] text-slate-500">
        <div className="flex items-center justify-between gap-3">
          <span>&copy; {new Date().getFullYear()} StockPros. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-400 transition cursor-pointer">Security</span>
            <span className="hover:text-slate-400 transition cursor-pointer">Terms</span>
            <span className="hover:text-slate-400 transition cursor-pointer">Privacy</span>
          </div>
        </div>
        <p className="text-slate-500 leading-relaxed">
          StockPros outputs are informational and educational only. They are not personalized financial, legal, tax, or fiduciary advice.
        </p>
      </footer>
    </div>
  );
};
