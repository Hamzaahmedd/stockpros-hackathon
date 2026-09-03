import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Sidebar } from "@/shared/components/Sidebar";
import { useTheme } from "@/shared/hooks/useTheme";
import api from "@/shared/api/axios";
import {
  Activity,
  Bell,
  Check,
  Cpu,
  FileText,
  Gem,
  Landmark,
  Mail,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { FiCheck, FiLayout, FiMonitor, FiMoon, FiSliders, FiSun } from "react-icons/fi";
import { toast } from "react-toastify";

const MARKET_TOPICS = [
  { id: "ai_tech", name: "AI & Tech", icon: Cpu, description: "Semiconductors, LLMs, cloud" },
  { id: "energy", name: "Energy", icon: Zap, description: "Oil, gas, clean renewables" },
  { id: "finance", name: "Finance", icon: Landmark, description: "Banks, fintech, payments" },
  { id: "healthcare", name: "Healthcare", icon: Activity, description: "Biotech, medtech, pharma" },
  { id: "growth", name: "Growth Stocks", icon: TrendingUp, description: "High-momentum tech & SaaS" },
  { id: "crypto", name: "Crypto & Web3", icon: Sparkles, description: "Digital assets & blockchain" },
  { id: "consumer", name: "Consumer", icon: ShoppingBag, description: "Retail, e-commerce, staples" },
  { id: "value", name: "Value Stocks", icon: Gem, description: "Dividend aristocrats & leaders" },
];

interface AlertOption {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const ALERT_OPTIONS: AlertOption[] = [
  {
    id: "in_app",
    title: "In-App Real-Time Alerts",
    description: "Instant pop-up triggers when prices cross key levels or AI signals fire.",
    icon: Bell,
  },
  {
    id: "email_alerts",
    title: "Email Volatility Alerts",
    description: "Direct email notifications for critical stop-loss or take-profit breaches.",
    icon: Mail,
  },
  {
    id: "daily_digest",
    title: "Daily Pre-Market Digest",
    description: "Receive a weekday pre-market briefing for your active watchlist at 8:30 AM New York time.",
    icon: FileText,
  },
];

const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("appearance");

  // Market & Alert preferences state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState<boolean | null>(null);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    try {
      const savedTopics = localStorage.getItem("stockpros_market_interests");
      if (savedTopics) setSelectedTopics(JSON.parse(savedTopics));
      else setSelectedTopics(["AI & Tech", "Growth Stocks"]);

      const savedAlerts = localStorage.getItem("stockpros_alert_preferences");
      if (savedAlerts) setSelectedAlerts(JSON.parse(savedAlerts));
      else setSelectedAlerts(["in_app", "email_alerts", "daily_digest"]);
    } catch {
      setSelectedTopics(["AI & Tech", "Growth Stocks"]);
      setSelectedAlerts(["in_app", "email_alerts", "daily_digest"]);
    }
  }, []);

  useEffect(() => {
    const loadNotificationPreferences = async () => {
      try {
        const response = await api.get("/api/v1/notifications/preferences");
        const digestActive = response.data?.data?.dailyDigestEnabled ?? true;
        setDailyDigestEnabled(digestActive);
        
        // Sync API response with alert selection state
        setSelectedAlerts((prev) => {
          if (digestActive && !prev.includes("daily_digest")) return [...prev, "daily_digest"];
          if (!digestActive && prev.includes("daily_digest")) return prev.filter((id) => id !== "daily_digest");
          return prev;
        });
      } catch {
        toast.error("Failed to load notification preferences.");
        setDailyDigestEnabled(true);
      }
    };

    void loadNotificationPreferences();
  }, []);

  const toggleTopic = (topicName: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicName) ? prev.filter((t) => t !== topicName) : [...prev, topicName]
    );
  };

  const toggleAlert = (alertId: string) => {
    const opt = ALERT_OPTIONS.find((o) => o.id === alertId);
    if (opt?.disabled) return;

    setSelectedAlerts((prev) => {
      const isSelected = prev.includes(alertId);
      const updated = isSelected ? prev.filter((a) => a !== alertId) : [...prev, alertId];

      if (alertId === "daily_digest") {
        setDailyDigestEnabled(!isSelected);
      }

      return updated;
    });
  };

  const handleSavePreferences = async () => {
    if (dailyDigestEnabled === null) return;

    try {
      setIsSavingPreferences(true);
      await api.patch("/api/v1/notifications/preferences", { 
        dailyDigestEnabled: selectedAlerts.includes("daily_digest") 
      });
      localStorage.setItem("stockpros_market_interests", JSON.stringify(selectedTopics));
      localStorage.setItem("stockpros_alert_preferences", JSON.stringify(selectedAlerts));
      toast.success("Preferences updated successfully!");
    } catch {
      toast.error("Failed to save notification preferences.");
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePhrase.trim() !== CONFIRMATION_PHRASE) return;
    setIsDeleting(true);
    try {
      const { deleteAccount } = await import("@/modules/auth/services");
      const { clearAccessToken } = await import("@/shared/utils/token");
      await deleteAccount(CONFIRMATION_PHRASE);
      clearAccessToken();
      toast.success("Account deleted. Redirecting…");
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Failed to delete account. Please try again.";
      toast.error(msg);
      setIsDeleting(false);
    }
  };

  const phraseMatches = deletePhrase.trim() === CONFIRMATION_PHRASE;

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto p-4 lg:p-8">
          <header className="mb-10">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground font-medium">
              Optimize your trading workspace, manage market interests, and adjust notification preferences.
            </p>
          </header>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-3 space-y-2">
              {[
                { id: "appearance", label: "Appearance", icon: <FiLayout className="text-lg" /> },
                { id: "preferences", label: "Market & Alerts", icon: <FiSliders className="text-lg" /> },
                {
                  id: "account",
                  label: "Account",
                  icon: (
                    <svg className="w-[1.1em] h-[1.1em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  ),
                },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setShowDeleteConfirm(false);
                    setDeletePhrase("");
                  }}
                  className={`w-full flex items-center justify-start gap-4 h-12 rounded-md font-bold text-xs uppercase tracking-widest ${
                    tab.id === "account" && activeTab !== "account"
                      ? "hover:text-red-400 hover:border-red-500/30"
                      : ""
                  }`}
                >
                  {tab.icon} {tab.label}
                </Button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 transition-all duration-300">
              {/* --- APPEARANCE TAB --- */}
              {activeTab === "appearance" && (
                <Card className="rounded-lg border border-border bg-card shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center gap-5 border-b border-border mb-6 p-8">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <FiMonitor className="text-2xl" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">Workspace Theme</CardTitle>
                      <CardDescription className="text-sm font-medium">
                        Choose your preferred visual environment.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Light Mode Card */}
                      <div
                        onClick={() => setTheme("light")}
                        className={`group relative overflow-hidden cursor-pointer rounded-lg border-2 transition-all duration-200 ${
                          theme === "light"
                            ? "border-primary ring-2 ring-primary/10"
                            : "border-border bg-muted/20"
                        }`}
                      >
                        <div className="p-6">
                          <div className="aspect-[16/10] rounded-md bg-white shadow-inner border border-border relative overflow-hidden mb-6">
                            <div className="absolute top-4 left-4 w-12 h-2 bg-gray-200 rounded-full" />
                            <div className="absolute top-8 left-4 w-20 h-1.5 bg-gray-100 rounded-full" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <FiSun
                                className={`text-4xl transform transition-transform group-hover:scale-110 ${
                                  theme === "light" ? "text-yellow-500" : "text-muted-foreground"
                                }`}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-widest ${
                                theme === "light" ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              System Light
                            </span>
                            {theme === "light" && <FiCheck className="text-primary" />}
                          </div>
                        </div>
                      </div>

                      {/* Dark Mode Card */}
                      <div
                        onClick={() => setTheme("dark")}
                        className={`group relative overflow-hidden cursor-pointer rounded-lg border-2 transition-all duration-200 ${
                          theme === "dark"
                            ? "border-primary ring-2 ring-primary/10"
                            : "border-border bg-muted/20"
                        }`}
                      >
                        <div className="p-6">
                          <div className="aspect-[16/10] rounded-md bg-[#020817] shadow-inner border border-border relative overflow-hidden mb-6">
                            <div className="absolute top-4 left-4 w-12 h-2 bg-white/10 rounded-full" />
                            <div className="absolute top-8 left-4 w-20 h-1.5 bg-white/5 rounded-full" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <FiMoon
                                className={`text-4xl transform transition-transform group-hover:scale-110 ${
                                  theme === "dark" ? "text-primary" : "text-muted-foreground"
                                }`}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-widest ${
                                theme === "dark" ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              System Dark
                            </span>
                            {theme === "dark" && <FiCheck className="text-primary" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* --- MARKET & ALERTS PREFERENCES TAB --- */}
              {activeTab === "preferences" && (
                <Card className="rounded-lg border border-border bg-card shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center gap-5 border-b border-border mb-6 p-8">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <FiSliders className="text-2xl" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">Market Interests & Alerts</CardTitle>
                      <CardDescription className="text-sm font-medium">
                        Personalize the news feed filters and notifications configured during onboarding.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-8 p-8 pt-0">
                    {/* Market Interests Section */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                            Market Sectors & Themes
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Filter intelligence feeds by the sectors you care about most.
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Selected: <strong className="text-primary">{selectedTopics.length}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {MARKET_TOPICS.map((topic) => {
                          const active = selectedTopics.includes(topic.name);
                          const Icon = topic.icon;
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => toggleTopic(topic.name)}
                              className={`p-3 rounded-xl border text-left transition-all duration-200 flex items-center justify-between gap-2 ${
                                active
                                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/40"
                                  : "border-border bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <div
                                  className={`p-1.5 rounded-lg shrink-0 ${
                                    active ? "bg-cyan-500/20 text-cyan-300" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {topic.name}
                                </span>
                              </div>
                              {active && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Alert Channels Section */}
                    <div>
                      <div className="mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                          Alert Channels
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Configure where volatility notices and intelligence digests are routed.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {ALERT_OPTIONS.map((opt) => {
                          const active = selectedAlerts.includes(opt.id);
                          const Icon = opt.icon;
                          const isDisabled = opt.disabled;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleAlert(opt.id)}
                              disabled={isDisabled}
                              className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between gap-3 ${
                                isDisabled
                                  ? "opacity-50 cursor-not-allowed border-border/50 bg-muted/10 text-muted-foreground"
                                  : active
                                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/30"
                                  : "border-border bg-muted/20 text-muted-foreground hover:border-border"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div
                                  className={`p-2 rounded-lg ${
                                    isDisabled
                                      ? "bg-muted/40 text-muted-foreground"
                                      : active
                                      ? "bg-cyan-500/20 text-cyan-300"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-5 h-5 rounded flex items-center justify-center transition ${
                                      isDisabled
                                        ? "border border-border/40 text-transparent"
                                        : active
                                        ? "bg-cyan-500 text-black font-bold"
                                        : "border border-border"
                                    }`}
                                  >
                                    {active && !isDisabled && <Check className="w-3.5 h-3.5" />}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-foreground">{opt.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                  {opt.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border">
                      <Button
                        type="button"
                        onClick={handleSavePreferences}
                        disabled={isSavingPreferences || dailyDigestEnabled === null}
                        className="px-6 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider"
                      >
                        {isSavingPreferences ? "Saving..." : "Save Preferences"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* --- ACCOUNT TAB --- */}
              {activeTab === "account" && (
                <div className="space-y-6">
                  {/* Account Info Card */}
                  <Card className="rounded-lg border border-border bg-card shadow-lg">
                    <CardHeader className="flex flex-row items-center gap-5 border-b border-border p-8">
                      <div className="p-3 rounded-lg bg-primary/10 text-primary">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold">Account Management</CardTitle>
                        <CardDescription className="text-sm font-medium">
                          Manage your account settings and data.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your account is protected and your data is stored securely. If you wish to permanently remove your account and all associated data, you can do so in the Danger Zone below.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Danger Zone Card */}
                  <div className="relative rounded-xl border border-red-500/40 bg-red-950/10 overflow-hidden shadow-lg shadow-red-950/10">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />

                    <div className="p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-red-500/15 text-red-400">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-red-400 uppercase tracking-wider">
                            Danger Zone
                          </h3>
                          <p className="text-xs text-red-400/70 mt-0.5">
                            These actions are irreversible. Proceed with caution.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-6">
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-1">Delete this account</p>
                          <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                            Permanently delete your StockPros account and all of your data. This action cannot be undone.
                          </p>
                        </div>
                        {!showDeleteConfirm && (
                          <button
                            id="btn-open-delete-confirm"
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="shrink-0 px-5 h-10 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 hover:border-red-500 transition-all duration-200"
                          >
                            Delete Account
                          </button>
                        )}
                      </div>

                      {/* Inline confirmation UI */}
                      {showDeleteConfirm && (
                        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/20 p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="rounded-lg border border-red-500/20 bg-red-900/10 p-4 space-y-3">
                            <p className="text-sm font-bold text-red-400 flex items-center gap-2">
                              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              Warning: Deleting your account is permanent and cannot be undone.
                            </p>
                            <p className="text-xs text-red-300/80 font-medium">
                              You will immediately lose:
                            </p>
                            <ul className="space-y-1.5">
                              {[
                                "Portfolio data & watchlists",
                                "Saved AI preferences & custom alerts",
                                "Premium feature access & account history",
                                "Active sessions on all devices",
                              ].map((item) => (
                                <li key={item} className="flex items-center gap-2 text-xs text-red-300/70">
                                  <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="delete-confirmation-input"
                              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                            >
                              To confirm, type{" "}
                              <span className="text-red-400 font-bold font-mono">{CONFIRMATION_PHRASE}</span>{" "}
                              below:
                            </label>
                            <input
                              id="delete-confirmation-input"
                              type="text"
                              value={deletePhrase}
                              onChange={(e) => setDeletePhrase(e.target.value)}
                              placeholder={CONFIRMATION_PHRASE}
                              autoComplete="off"
                              spellCheck={false}
                              className={`w-full h-11 rounded-lg border px-4 text-sm font-mono bg-background/60 outline-none transition-all duration-200 placeholder:text-muted-foreground/40 ${
                                deletePhrase.length > 0 && !phraseMatches
                                  ? "border-red-500/60 focus:border-red-500 text-red-300"
                                  : phraseMatches
                                  ? "border-green-500/60 focus:border-green-500 text-green-300"
                                  : "border-border focus:border-red-500/60"
                              }`}
                            />
                            {deletePhrase.length > 0 && !phraseMatches && (
                              <p className="text-[11px] text-red-400/80">
                                Phrase doesn't match — type it exactly as shown above.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;