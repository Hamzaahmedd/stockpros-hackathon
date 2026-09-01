import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Sidebar } from "@/shared/components/Sidebar";
import { useTheme } from "@/shared/hooks/useTheme";
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

const ALERT_OPTIONS = [
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
    description: "Curated AI summary of news, sector trends, and your watchlist before market open.",
    icon: FileText,
  },
];

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("appearance");

  // Market & Alert preferences state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);

  useEffect(() => {
    try {
      const savedTopics = localStorage.getItem("stockpros_market_interests");
      if (savedTopics) setSelectedTopics(JSON.parse(savedTopics));
      else setSelectedTopics(["AI & Tech", "Growth Stocks"]);

      const savedAlerts = localStorage.getItem("stockpros_alert_preferences");
      if (savedAlerts) setSelectedAlerts(JSON.parse(savedAlerts));
      else setSelectedAlerts(["in_app", "daily_digest"]);
    } catch {
      setSelectedTopics(["AI & Tech", "Growth Stocks"]);
      setSelectedAlerts(["in_app", "daily_digest"]);
    }
  }, []);

  const toggleTopic = (topicName: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicName) ? prev.filter((t) => t !== topicName) : [...prev, topicName]
    );
  };

  const toggleAlert = (alertId: string) => {
    setSelectedAlerts((prev) =>
      prev.includes(alertId) ? prev.filter((a) => a !== alertId) : [...prev, alertId]
    );
  };

  const handleSavePreferences = () => {
    localStorage.setItem("stockpros_market_interests", JSON.stringify(selectedTopics));
    localStorage.setItem("stockpros_alert_preferences", JSON.stringify(selectedAlerts));
    toast.success("Preferences updated successfully!");
  };

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto p-4 lg:p-8">
          <header className="mb-10 px-8 py-10 rounded-lg border border-border bg-card shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground font-medium">
              Optimize your trading workspace, manage market interests, and adjust notification preferences.
            </p>
          </header>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-3 space-y-2">
              {[
                { id: "appearance", label: "Appearance", icon: <FiLayout className="text-lg" /> },
                { id: "preferences", label: "Market & Alerts", icon: <FiSliders className="text-lg" /> },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center justify-start gap-4 h-12 rounded-md font-bold text-xs uppercase tracking-widest"
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
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleAlert(opt.id)}
                              className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between gap-3 ${
                                active
                                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/30"
                                  : "border-border bg-muted/20 text-muted-foreground hover:border-border"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div
                                  className={`p-2 rounded-lg ${
                                    active ? "bg-cyan-500/20 text-cyan-300" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div
                                  className={`w-5 h-5 rounded flex items-center justify-center transition ${
                                    active ? "bg-cyan-500 text-black font-bold" : "border border-border"
                                  }`}
                                >
                                  {active && <Check className="w-3.5 h-3.5" />}
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
                        className="px-6 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider"
                      >
                        Save Preferences
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
