import api from "@/shared/api/axios";
import { ReportDownloadButton } from "@/shared/components/ReportDownloadButton";
import { Sidebar } from "@/shared/components/Sidebar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTheme } from "@/shared/hooks/useTheme";
import { SECONDARY_ACTION_BTN } from "@/shared/utils/buttonStyles";
import React, { useCallback, useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiAward,
  FiBarChart2,
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiGrid,
  FiList,
  FiPieChart,
  FiRadio,
  FiShield,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
  FiUpload,
  FiX,
  FiZap,
} from "react-icons/fi";
import { toast } from "react-toastify";
import type {
  DetailedDecision,
  MergedRow,
  OverviewDecision,
  PortfolioData,
  PortfolioRiskMetrics,
} from "../types";
import { downloadPortfolioReportCsv } from "../utils/downloadPortfolioReportCsv";
import { downloadPortfolioReportPdf } from "../utils/downloadPortfolioReportPdf";
import { computeRiskProfileLabel } from "../utils/portfolioReport";

/* ───────────── component ───────────── */

const PortfolioHealth: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === "dark";

  // state
  const [pageLoading, setPageLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<PortfolioRiskMetrics | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>('list');

  const [overviewDecisions, setOverviewDecisions] = useState<OverviewDecision[]>([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<Record<string, DetailedDecision>>({});

  // ── helpers ──
  const card = "bg-card border-border hover:border-border/80 transition-all duration-300";

  // ── fetch overview decisions ──
  const fetchOverview = useCallback(async (portfolioId: string) => {
    try {
      setOverviewLoading(true);
      const [decisionRes, riskRes] = await Promise.all([
        api.post("/api/v1/decision-support/portfolio/decision", {
          portfolioId,
          decisionMode: "OVERVIEW",
        }),
        api.post("/api/v1/decision-support/portfolio/risk-metrics", {
          portfolioId,
        }).catch((err) => {
          console.warn("Failed risk metrics fetch", err);
          return { data: { success: false, data: null } };
        }),
      ]);

      if (decisionRes.data.success) {
        setOverviewDecisions(decisionRes.data.data.positions);
      }
      if (riskRes.data?.success && riskRes.data.data) {
        setRiskMetrics(riskRes.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch overview", err);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // ── fetch detailed for a single symbol (clicks View) ──
  const fetchDetailed = useCallback(async (portfolioId: string, symbol: string) => {
    if (detailedData[symbol]) {
      setExpandedSymbol(symbol);
      return;
    }
    try {
      setDetailLoading(true);
      const res = await api.post("/api/v1/decision-support/portfolio/decision", {
        portfolioId,
        decisionMode: "DETAILED",
      });
      if (res.data.success) {
        const map: Record<string, DetailedDecision> = {};
        res.data.data.positions.forEach((p: DetailedDecision) => {
          map[p.symbol] = p;
        });
        setDetailedData(map);
        setExpandedSymbol(symbol);
      }
    } catch (err) {
      console.error("Failed to fetch detailed", err);
      toast.error("Failed to load detailed analysis");
    } finally {
      setDetailLoading(false);
    }
  }, [detailedData]);

  // ── load portfolio on mount ──
  useEffect(() => {
    (async () => {
      try {
        setPageLoading(true);
        const res = await api.get("/api/v1/decision-support/portfolio/latest");
        if (res.data.success && res.data.data) {
          setPortfolioData(res.data.data);
          await fetchOverview(res.data.data.portfolioId);
        }
      } catch {
        // no portfolio yet
      } finally {
        setPageLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── upload ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("portfolio", file);
    try {
      setUploading(true);
      const res = await api.post("/api/v1/decision-support/upload-portfolio", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        toast.success("Portfolio uploaded successfully");
        setPortfolioData(res.data.data);
        setDetailedData({});
        setExpandedSymbol(null);
        await fetchOverview(res.data.data.portfolioId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ── merge overview into positions ──
  const merged: MergedRow[] = (portfolioData?.positions ?? []).map((p) => {
    const d = overviewDecisions.find((dd) => dd.symbol === p.symbol);
    const rm = riskMetrics?.perSymbol?.find((ps) => ps.symbol === p.symbol);
    return {
      ...p,
      ...d,
      beta: rm?.beta ?? d?.beta ?? 1.0,
      sharpe: rm?.sharpe ?? d?.sharpe ?? 0,
      volatilityAnnualized: rm?.volatilityAnnualized ?? d?.volatilityAnnualized ?? 0,
    };
  });

  // ── download detailed report (CSV or PDF) ──
  const handleDownloadReport = async (format: 'csv' | 'pdf') => {
    if (!portfolioData) return;
    try {
      setReportLoading(true);
      const res = await api.post("/api/v1/decision-support/portfolio/decision", {
        portfolioId: portfolioData.portfolioId,
        decisionMode: "DETAILED",
      });
      if (!res.data.success) { toast.error("Failed to generate report"); return; }

      const detailedPositions: DetailedDecision[] = res.data.data.positions;

      if (format === 'csv') {
        downloadPortfolioReportCsv(portfolioData, detailedPositions, riskMetrics);
        toast.success("Report downloaded as CSV");
      } else {
        downloadPortfolioReportPdf(portfolioData, detailedPositions, riskMetrics);
        toast.success("Report downloaded as PDF");
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  // ── risk profile (label shared with the report exporters) ──
  const riskProfileLabel = computeRiskProfileLabel(overviewDecisions);
  const riskProfileColor =
    riskProfileLabel === "Aggressive" ? "text-rose-400" :
    riskProfileLabel === "Moderate" ? "text-orange-400" :
    riskProfileLabel === "Conservative" ? "text-emerald-400" : "text-gray-400";

  // ── decision badge color ──
  const decisionColor = (d?: string) => {
    switch (d) {
      case "ADD": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "HOLD": return "bg-muted text-muted-foreground border-border";
      case "TRIM": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "EXIT": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getHeatmapColorClass = (roi: number) => {
    if (roi <= -20) return "bg-rose-950/70 border-rose-500 text-rose-100 shadow-rose-950/30";
    if (roi < -5) return "bg-amber-950/60 border-amber-500 text-amber-100";
    if (roi <= 5) return "bg-muted/40 border-border text-foreground";
    if (roi < 20) return "bg-emerald-950/50 border-emerald-500/70 text-emerald-100";
    return "bg-emerald-950/90 border-emerald-400 text-emerald-50 shadow-lg shadow-emerald-950/50";
  };

  /* ───────────── render ───────────── */
  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1440px] mx-auto space-y-8">

          {/* ── Header ── */}
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/60 pb-6">
            <div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
                Portfolio Health
              </h1>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mt-1 opacity-80">
                AI-Driven Portfolio Optimization &amp; Quantitative Risk Intelligence
              </p>
            </div>
            <div className="flex items-center gap-3">
              {portfolioData && (
                <ReportDownloadButton
                  onDownload={handleDownloadReport}
                  loading={reportLoading}
                  disabled={!portfolioData}
                  title="Download the portfolio health report"
                />
              )}
              <label className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer font-bold text-xs transition-all duration-200 ${uploading ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}>
                {uploading ? <Skeleton className="w-4 h-4 rounded-full" /> : <FiUpload />}
                {uploading ? "Processing..." : "Upload Portfolio"}
                <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".csv,.xlsx,.xls" />
              </label>
            </div>
          </div>

          {/* ── Empty / Loading ── */}
          {pageLoading ? (
            <div className="space-y-8">
              {/* ── Summary Cards Skeleton ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border border-border rounded-lg p-6 bg-card space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="w-8 h-8 rounded-lg" />
                    </div>
                    <Skeleton className="h-8 w-32 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded" />
                  </div>
                ))}
              </div>

              {/* ── Table Skeleton ── */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <Skeleton className="h-5 w-64 rounded" />
                  <Skeleton className="h-4 w-28 rounded" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Asset", "Holdings", "Performance", "AI Decision", "Confidence", "Risk", "Analysis"].map((h, i) => (
                          <th key={i} className="px-6 py-4">
                            <Skeleton className="h-3.5 w-20 rounded" />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-8 py-5 space-y-2">
                            <Skeleton className="h-6 w-16 rounded" />
                            <Skeleton className="h-3 w-24 rounded" />
                          </td>
                          <td className="px-6 py-5 space-y-1.5">
                            <Skeleton className="h-3 w-20 rounded" />
                            <Skeleton className="h-3 w-24 rounded" />
                            <Skeleton className="h-3 w-28 rounded" />
                          </td>
                          <td className="px-6 py-5 space-y-2">
                            <Skeleton className="h-6 w-24 rounded" />
                            <Skeleton className="h-3 w-16 rounded" />
                          </td>
                          <td className="px-6 py-5 space-y-2">
                            <Skeleton className="h-6 w-20 rounded" />
                            <Skeleton className="h-3 w-24 rounded" />
                          </td>
                          <td className="px-6 py-5 space-y-2">
                            <Skeleton className="h-4 w-12 rounded" />
                            <Skeleton className="h-2 w-28 rounded-full" />
                          </td>
                          <td className="px-6 py-5">
                            <Skeleton className="h-6 w-16 rounded-full" />
                          </td>
                          <td className="px-6 py-5 text-right">
                            <Skeleton className="h-8 w-24 rounded-md ml-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : !portfolioData ? (
            <EmptyState icon={<FiBriefcase size={40} />} title="No Portfolio Active" sub="Upload your equity portfolio (CSV/Excel) to receive real-time health analysis and AI trade recommendations." dark={dark} />
          ) : (
            <div className="space-y-8">

              {/* ── Summary Cards ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<FiPieChart />} iconCls="bg-blue-500/10 text-blue-500" label="Market Value" card={card}>
                  <span className="text-2xl md:text-3xl font-bold tracking-tight">${portfolioData.summary.totalMarketValue.toLocaleString()}</span>
                  <span className="block text-[10px] text-muted-foreground mt-1 font-medium">Current Portfolio Equity</span>
                </StatCard>

                <StatCard icon={<FiTrendingUp />} iconCls="bg-primary/10 text-primary" label="Unrealized PnL" card={card}>
                  <span className={`text-2xl md:text-3xl font-bold tracking-tight ${portfolioData.summary.totalUnrealizedPnL >= 0 ? "text-green-500" : "text-destructive"}`}>
                    {portfolioData.summary.totalUnrealizedPnL >= 0 ? "+" : ""}${Math.abs(portfolioData.summary.totalUnrealizedPnL).toLocaleString()}
                  </span>
                  <span className={`block text-[10px] font-bold mt-1 ${portfolioData.summary.totalUnrealizedPnL >= 0 ? "text-green-500/70" : "text-destructive/70"}`}>
                    {portfolioData.summary.totalUnrealizedPnLPercent.toFixed(2)}% Overall ROI
                  </span>
                </StatCard>

                <StatCard icon={<FiTarget />} iconCls="bg-purple-500/10 text-purple-500" label="Positions" card={card}>
                  <span className="text-2xl md:text-3xl font-bold tracking-tight">{portfolioData.summary.totalPositions}</span>
                  <span className="block text-[10px] text-muted-foreground mt-1 font-medium">Active Equity Tickers</span>
                </StatCard>

                <StatCard icon={<FiShield />} iconCls="bg-orange-500/10 text-orange-500" label="Risk Profile" card={card}>
                  <span className={`text-2xl md:text-3xl font-bold tracking-tight italic ${riskProfileColor}`}>{riskProfileLabel}</span>
                  <span className="block text-[10px] text-muted-foreground mt-1 font-medium italic">AI Computed Rating</span>
                </StatCard>
              </div>

              {/* ── Risk & Volatility Audit Panel (Persona B) ── */}
              {riskMetrics && (
                <div className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 space-y-6 shadow-md">
                  <div className="flex items-center justify-between border-b border-border/60 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <FiActivity className="text-lg" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black tracking-tight">Risk &amp; Volatility Audit</h3>
                        <p className="text-xs text-muted-foreground font-medium">
                          Portfolio-level systemic beta, Sharpe ratio efficiency, and sector concentration audit
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                      Persona B Metrics
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Portfolio Beta */}
                    <div className="p-5 rounded-xl border border-border bg-background space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Portfolio Beta</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                          riskMetrics.weightedBeta > 1.2
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                            : riskMetrics.weightedBeta < 0.8
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          {riskMetrics.weightedBeta > 1.2 ? 'High Sensitivity' : riskMetrics.weightedBeta < 0.8 ? 'Defensive' : 'Market Baseline'}
                        </span>
                      </div>
                      <div className="text-4xl font-black text-primary">
                        {riskMetrics.weightedBeta.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        Weighted systemic sensitivity to broad market movements (1.0 = S&amp;P 500 equivalent).
                      </p>
                    </div>

                    {/* Sharpe Ratio */}
                    <div className="p-5 rounded-xl border border-border bg-background space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sharpe Ratio</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                          riskMetrics.portfolioSharpe > 1.0
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : riskMetrics.portfolioSharpe > 0
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        }`}>
                          {riskMetrics.portfolioSharpe > 1.0 ? 'Superior Alpha' : riskMetrics.portfolioSharpe > 0 ? 'Positive Risk-Adj' : 'Sub-Optimal'}
                        </span>
                      </div>
                      <div className="text-4xl font-black text-primary">
                        {riskMetrics.portfolioSharpe.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        Risk-adjusted excess return per unit volatility over 5.25% US 3M risk-free benchmark.
                      </p>
                    </div>

                    {/* Sector Concentration Mini-Bar Chart */}
                    <div className="p-5 rounded-xl border border-border bg-background space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sector Concentration</span>
                        <span className="text-[10px] font-bold text-muted-foreground">Weights</span>
                      </div>

                      <div className="space-y-2.5 pt-1">
                        {riskMetrics.sectorConcentration.slice(0, 3).map((sc) => (
                          <div key={sc.sector} className="space-y-1">
                            <div className="flex justify-between text-[11px] font-bold">
                              <span className="truncate max-w-[160px]">{sc.sector}</span>
                              <span className={sc.weight > 40 ? "text-rose-500" : "text-primary"}>
                                {sc.weight.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  sc.weight > 40 ? "bg-rose-500" : "bg-primary"
                                }`}
                                style={{ width: `${Math.min(100, sc.weight)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── View Mode Switcher & Content ── */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <FiActivity className="text-primary" />
                      Asset Allocation &amp; Decision Intelligence
                    </h3>
                    
                    {/* Toggle between List & Heatmap */}
                    <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border ml-2">
                      <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                          viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FiList size={12} /> List View
                      </button>
                      <button
                        onClick={() => setViewMode('heatmap')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                          viewMode === 'heatmap' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FiGrid size={12} /> Heatmap View
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {overviewLoading && <Pulse text="Loading decisions..." />}
                    <span className="text-[10px] text-muted-foreground font-medium italic">
                      Live • {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {viewMode === 'heatmap' ? (
                  /* ── Visual Heatmap Grid ── */
                  <div className="p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {merged.map((pos) => {
                        const isExpanded = expandedSymbol === pos.symbol;

                        return (
                          <div
                            key={pos.symbol}
                            onClick={() => {
                              if (isExpanded) setExpandedSymbol(null);
                              else if (portfolioData) fetchDetailed(portfolioData.portfolioId, pos.symbol);
                            }}
                            className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between select-none ${getHeatmapColorClass(
                              pos.unrealizedPnLPercent,
                            )} ${isExpanded ? "ring-2 ring-primary scale-[1.02]" : "hover:scale-[1.02]"}`}
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-base font-black tracking-tight">{pos.symbol}</span>
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 truncate max-w-[60px]">
                                {pos.sector || "—"}
                              </span>
                            </div>

                            <div className="my-3">
                              <div className="text-xl font-black">
                                {pos.unrealizedPnLPercent >= 0 ? "+" : ""}
                                {pos.unrealizedPnLPercent.toFixed(2)}%
                              </div>
                              <div className="text-[10px] opacity-80 font-mono">
                                ${pos.currentValue.toLocaleString()}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-current/20 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
                              <span>Action</span>
                              <span className="font-black">{pos.portfolioDecision || "HOLD"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Heatmap Legend */}
                    <div className="mt-6 flex items-center justify-center gap-6 flex-wrap text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-rose-700 border border-rose-500" /> &lt; -20%
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-amber-700 border border-amber-500" /> -20% to -5%
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-muted border border-border" /> -5% to +5%
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-700 border border-emerald-500" /> +5% to +20%
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-500 border border-emerald-300" /> &gt; +20%
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Standard Table View with Compact Spacing & Sticky Action Column ── */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                          <th className="px-4 py-3.5">Asset</th>
                          <th className="px-4 py-3.5">Holdings</th>
                          <th className="px-4 py-3.5">Performance</th>
                          <th className="px-3 py-3.5 text-center">Beta</th>
                          <th className="px-3 py-3.5 text-center">Sharpe</th>
                          <th className="px-4 py-3.5">AI Decision</th>
                          <th className="px-4 py-3.5">Confidence</th>
                          <th className="px-4 py-3.5">Risk</th>
                          <th className="px-4 py-3.5 text-right sticky right-0 bg-card/95 backdrop-blur shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.15)]">Analysis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {merged.map((pos) => {
                          const detail = detailedData[pos.symbol];
                          const isExpanded = expandedSymbol === pos.symbol;

                          return (
                            <React.Fragment key={pos.symbol}>
                              {/* ── main row (clickable everywhere) ── */}
                              <tr
                                onClick={() => {
                                  if (isExpanded) { setExpandedSymbol(null); return; }
                                  if (portfolioData) fetchDetailed(portfolioData.portfolioId, pos.symbol);
                                }}
                                className="group hover:bg-muted/50 transition-colors duration-200 cursor-pointer"
                              >
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <span className="text-base font-black tracking-tight">{pos.symbol}</span>
                                      <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{pos.sector || "—"}</span>
                                    </div>
                                    <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary">
                                      {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <KV label="Qty" value={String(pos.quantity)} />
                                  <KV label="Entry" value={`$${pos.avg_entry_price.toFixed(2)}`} />
                                  <KV label="Value" value={`$${pos.currentValue.toLocaleString()}`} accent />
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className={`text-base font-bold tracking-tight ${pos.unrealizedPnL >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                    {pos.unrealizedPnL >= 0 ? "+" : "-"}${Math.abs(pos.unrealizedPnL).toLocaleString()}
                                  </div>
                                  <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${pos.unrealizedPnLPercent >= 0 ? "text-emerald-500/70" : "text-destructive/70"}`}>
                                    {pos.unrealizedPnLPercent.toFixed(2)}% ROI
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className="text-xs font-bold text-primary font-mono">
                                    {pos.beta != null ? pos.beta.toFixed(2) : '1.00'}
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-center">
                                  <span className={`text-xs font-bold font-mono ${
                                    (pos.sharpe ?? 0) >= 1.0 ? 'text-emerald-500' : (pos.sharpe ?? 0) < 0 ? 'text-destructive' : 'text-primary'
                                  }`}>
                                    {pos.sharpe != null ? pos.sharpe.toFixed(2) : '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5">
                                  {pos.portfolioDecision ? (
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">Action</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${decisionColor(pos.portfolioDecision)}`}>
                                          {pos.portfolioDecision}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">Signal</span>
                                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${pos.marketDecision === 'BUY' ? 'text-emerald-500 bg-emerald-500/10' :
                                          pos.marketDecision === 'SELL' ? 'text-destructive bg-destructive/10' : 'bg-muted text-muted-foreground'
                                          }`}>
                                          <div className={`w-1 h-1 rounded-full ${pos.marketDecision === 'BUY' ? 'bg-emerald-500' :
                                            pos.marketDecision === 'SELL' ? 'bg-destructive' : 'bg-muted-foreground'
                                            }`} />
                                          {pos.marketDecision}
                                        </span>
                                      </div>
                                    </div>
                                  ) : <Pulse text="Analyzing..." />}
                                </td>
                                <td className="px-4 py-3.5">
                                  {pos.confidence != null ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-base font-black text-primary">{(pos.confidence * 100).toFixed(0)}%</span>
                                      <div className="w-14 h-1 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-700 ${pos.confidence >= 0.8 ? "bg-emerald-500" : pos.confidence >= 0.6 ? "bg-primary" : pos.confidence >= 0.4 ? "bg-orange-500" : "bg-destructive"
                                            }`}
                                          style={{ width: `${pos.confidence * 100}%` }}
                                        />
                                      </div>
                                      <span className={`text-[8px] font-bold uppercase tracking-wider ${pos.confidence >= 0.8 ? "text-emerald-500" : pos.confidence >= 0.6 ? "text-primary" : pos.confidence >= 0.4 ? "text-orange-500" : "text-destructive"
                                        }`}>
                                        {pos.confidence >= 0.8 ? "Very High" : pos.confidence >= 0.6 ? "High" : pos.confidence >= 0.4 ? "Moderate" : "Low"}
                                      </span>
                                    </div>
                                  ) : <Pulse text="—" />}
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${pos.riskLevel === "HIGH" ? "text-destructive border-destructive/20 bg-destructive/5" :
                                    pos.riskLevel === "MEDIUM" ? "text-orange-500 border-orange-500/20 bg-orange-500/5" :
                                      "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                                    }`}>
                                    {pos.riskLevel || "LOW"}
                                  </span>
                                  <div className="mt-1.5">
                                    {pos.unrealizedPnLPercent < -20 ? (
                                      <Tag icon={<FiAlertCircle />} text="Critical" scheme="rose" />
                                    ) : pos.unrealizedPnLPercent > 20 ? (
                                      <Tag icon={<FiCheckCircle />} text="Strong" scheme="emerald" />
                                    ) : (
                                      <Tag icon={<FiActivity />} text="Stable" scheme="muted" />
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right sticky right-0 bg-card/95 backdrop-blur group-hover:bg-muted/50 transition-colors shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.15)]">
                                  <Button
                                    disabled={detailLoading}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isExpanded) { setExpandedSymbol(null); return; }
                                      if (portfolioData) fetchDetailed(portfolioData.portfolioId, pos.symbol);
                                    }}
                                    variant="secondary"
                                    size="sm"
                                    className={`text-[10px] font-bold ${SECONDARY_ACTION_BTN}`}
                                  >
                                    {detailLoading && !isExpanded
                                      ? <Skeleton className="w-3 h-3 rounded-full" />
                                      : isExpanded ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />
                                    }
                                    {isExpanded ? "Hide" : "View"}
                                  </Button>
                                </td>
                              </tr>

                              {/* ── expanded detail panel ── */}
                              {isExpanded && detail && (
                                <tr>
                                  <td colSpan={9} className="p-0">
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="mx-6 mb-5 mt-1 rounded-2xl border border-border bg-muted/20 overflow-hidden"
                                    >
                                      {/* close bar */}
                                      <div className="flex items-center justify-between px-6 pt-5 pb-2">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                                          Detailed Analysis — {detail.symbol}
                                        </span>
                                        <button onClick={() => setExpandedSymbol(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                          <FiX size={16} />
                                        </button>
                                      </div>

                                      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                                        {/* reasoning */}
                                        <div>
                                          <SectionLabel text="AI Reasoning" color="text-primary" />
                                          <p className="text-sm font-medium leading-relaxed mt-2">
                                            {detail.reasoning.summary}
                                          </p>
                                          {detail.reasoning.details.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {detail.reasoning.details.map((d, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/10">
                                                  <FiAlertCircle size={10} /> {d}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {/* exposure */}
                                        <div>
                                          <SectionLabel text="Exposure Analysis" color="text-purple-500" />
                                          <div className="mt-3 space-y-3">
                                            <Bar label="Position Weight" value={detail.exposure.positionPercent} warn={detail.exposure.positionPercent > 15} />
                                            <Bar label="Sector Exposure" value={detail.exposure.sectorPercent} warn={detail.exposure.sectorPercent > 40} />
                                            {detail.exposure.isOverExposed && (
                                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-2.5 py-1 rounded border border-destructive/20 mt-1">
                                                <FiAlertCircle size={10} /> Over-Exposed
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* action guidance */}
                                        <div>
                                          <SectionLabel text="Action Guidance" color="text-emerald-500" />
                                          <div className="mt-3 space-y-3">
                                            <div className="flex flex-wrap gap-1.5">
                                              {Object.entries(detail.actionGuidance.positionStrategy).map(([k, v]) => (
                                                <span key={k} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${v ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground/30 border-border line-through opacity-30"
                                                  }`}>{k}</span>
                                              ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">Take Profit</span>
                                                <span className="text-sm font-bold text-emerald-500">${detail.actionGuidance.takeProfitZone}</span>
                                              </div>
                                              <div>
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">Stop Loss</span>
                                                <span className="text-sm font-bold text-destructive">${detail.actionGuidance.stopLossZone}</span>
                                              </div>
                                            </div>
                                            <div>
                                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">Hold Duration</span>
                                              <span className="text-sm font-bold">{detail.actionGuidance.holdDuration}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {detail.actionGuidance.watchFor.map((w, i) => (
                                                <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded border border-border bg-background text-muted-foreground">{w}</span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

/* ───────────── sub-components ───────────── */

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; sub: string; dark: boolean }> = ({ icon, title, sub }) => (
  <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-border rounded-lg bg-card/50">
    <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6">{icon}</div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-muted-foreground max-w-sm text-center text-sm">{sub}</p>
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; iconCls: string; label: string; card: string; children: React.ReactNode }> = ({ icon, iconCls, label, children }) => (
  <Card className="rounded-lg transition-all duration-300">
    <CardContent className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconCls}`}>{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {children}
    </CardContent>
  </Card>
);

const KV: React.FC<{ label: string; value: string; italic?: boolean; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">{label}</span>
    <span className={`text-sm font-bold ${accent ? "text-primary" : ""}`}>{value}</span>
  </div>
);

const Pulse: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-2 animate-pulse">
    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
    <span className="text-xs text-muted-foreground font-medium italic">{text}</span>
  </div>
);

const Tag: React.FC<{ icon: React.ReactNode; text: string; scheme: "rose" | "emerald" | "muted" }> = ({ icon, text, scheme }) => {
  const c = scheme === "rose" ? "text-destructive bg-destructive/10" : scheme === "emerald" ? "text-green-500 bg-green-500/10" : "text-muted-foreground bg-muted";
  return <div className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-transparent ${c}`}>{icon} {text}</div>;
};

const SectionLabel: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <div className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{text}</div>
);

const Bar: React.FC<{ label: string; value: number; warn: boolean }> = ({ label, value, warn }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold">{value.toFixed(2)}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
      <div className={`h-full rounded-full transition-all duration-700 ${warn ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  </div>
);

export default PortfolioHealth;

