import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTheme } from "@/shared/hooks/useTheme";
import React, { useCallback, useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiDownload,
  FiPieChart,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { toast } from "react-toastify";
import type {
  DetailedDecision,
  MergedRow,
  OverviewDecision,
  PortfolioData
} from "../types";

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

  const [overviewDecisions, setOverviewDecisions] = useState<OverviewDecision[]>([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<Record<string, DetailedDecision>>({});

  // ── helpers ──
  const card = "bg-card border-border hover:border-border/80 transition-all duration-300";

  // ── fetch overview decisions ──
  const fetchOverview = useCallback(async (portfolioId: string) => {
    try {
      setOverviewLoading(true);
      const res = await api.post("/api/v1/decision-support/portfolio/decision", {
        portfolioId,
        decisionMode: "OVERVIEW",
      });
      if (res.data.success) setOverviewDecisions(res.data.data.positions);
    } catch (err) {
      console.error("Failed to fetch overview", err);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // ── fetch detailed for a single symbol (clicks View) ──
  const fetchDetailed = useCallback(async (portfolioId: string, symbol: string) => {
    // if we already have it cached, just expand
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
    return { ...p, ...d };
  });

  // ── download detailed report ──
  const downloadReport = async () => {
    if (!portfolioData) return;
    try {
      setReportLoading(true);
      // Always fetch fresh DETAILED data for the report
      const res = await api.post("/api/v1/decision-support/portfolio/decision", {
        portfolioId: portfolioData.portfolioId,
        decisionMode: "DETAILED",
      });
      if (!res.data.success) { toast.error("Failed to generate report"); return; }

      const detailedPositions: DetailedDecision[] = res.data.data.positions;
      const reportRows = (portfolioData.positions ?? []).map((p) => {
        const d = detailedPositions.find((dd) => dd.symbol === p.symbol);
        return { ...p, ...d };
      });

      const headers = [
        "Symbol", "Sector", "Qty", "Entry Price", "Current Price", "Market Value",
        "Unrealized PnL", "ROI %", "Market Decision", "Portfolio Decision",
        "Confidence %", "Risk Level", "Reasoning", "Risk Flags",
        "Position Exposure %", "Sector Exposure %", "Over Exposed",
        "Strategy - Add", "Strategy - Hold", "Strategy - Trim", "Strategy - Exit",
        "Hold Duration", "Take Profit Zone", "Stop Loss Zone", "Watch For",
      ];

      const rows = reportRows.map((r: any) => [
        r.symbol, r.sector || "", r.quantity,
        r.avg_entry_price?.toFixed(2) ?? "", r.currentPrice?.toFixed(2) ?? "",
        r.currentValue?.toFixed(2) ?? "", r.unrealizedPnL?.toFixed(2) ?? "",
        (r.unrealizedPnLPercent?.toFixed(2) ?? "") + "%",
        r.marketDecision ?? "", r.portfolioDecision ?? "",
        r.confidence != null ? (r.confidence * 100).toFixed(0) + "%" : "",
        r.riskLevel ?? "",
        `"${r.reasoning?.summary ?? ""}"`,
        `"${(r.reasoning?.details ?? []).join("; ")}"`,
        r.exposure?.positionPercent?.toFixed(2) ?? "",
        r.exposure?.sectorPercent?.toFixed(2) ?? "",
        r.exposure?.isOverExposed ? "YES" : "NO",
        r.actionGuidance?.positionStrategy?.add ? "YES" : "NO",
        r.actionGuidance?.positionStrategy?.hold ? "YES" : "NO",
        r.actionGuidance?.positionStrategy?.trim ? "YES" : "NO",
        r.actionGuidance?.positionStrategy?.exit ? "YES" : "NO",
        r.actionGuidance?.holdDuration ?? "",
        r.actionGuidance?.takeProfitZone ?? "",
        r.actionGuidance?.stopLossZone ?? "",
        `"${(r.actionGuidance?.watchFor ?? []).join("; ")}"`,
      ]);

      const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio_detailed_report_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Detailed report downloaded");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  // ── risk profile from overview ──
  const riskProfile = (() => {
    if (overviewDecisions.length === 0) return { label: "—", color: "text-gray-400" };
    const highCount = overviewDecisions.filter((d) => d.riskLevel === "HIGH").length;
    const ratio = highCount / overviewDecisions.length;
    if (ratio >= 0.6) return { label: "Aggressive", color: "text-rose-400" };
    if (ratio >= 0.3) return { label: "Moderate", color: "text-orange-400" };
    return { label: "Conservative", color: "text-emerald-400" };
  })();

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

  /* ───────────── render ───────────── */
  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto space-y-8">

          {/* ── Header ── */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                Portfolio Health
              </h1>
              <p className="text-muted-foreground text-sm mt-1 font-medium italic opacity-80">
                AI-Driven Portfolio Optimization &amp; Decision Support
              </p>
            </div>
            <div className="flex items-center gap-3">
              {portfolioData && (
                <Button
                  onClick={downloadReport}
                  disabled={reportLoading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {reportLoading ? <Skeleton className="w-4 h-4 rounded-full" /> : <FiDownload size={16} />}
                  {reportLoading ? "Generating..." : "Download Report"}
                </Button>
              )}
              <label className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer font-bold transition-all duration-200 ${uploading ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
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
                  <span className={`text-2xl md:text-3xl font-bold tracking-tight italic ${riskProfile.color}`}>{riskProfile.label}</span>
                  <span className="block text-[10px] text-muted-foreground mt-1 font-medium italic">AI Computed Rating</span>
                </StatCard>
              </div>

              {/* ── Table ── */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <FiActivity className="text-primary" />
                    Asset Allocation &amp; Decision Intelligence
                  </h3>
                  <div className="flex items-center gap-4">
                    {overviewLoading && <Pulse text="Loading decisions..." />}
                    <span className="text-[10px] text-muted-foreground font-medium italic">
                      Live • {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                          <th className="px-8 py-4">Asset</th>
                          <th className="px-6 py-4">Holdings</th>
                          <th className="px-6 py-4">Performance</th>
                          <th className="px-6 py-4">AI Decision</th>
                          <th className="px-6 py-4">Confidence</th>
                          <th className="px-6 py-4">Risk</th>
                          <th className="px-6 py-4 text-right">Analysis</th>
                        </tr>
                      </thead>
                    <tbody className="divide-y divide-border">
                      {merged.map((pos) => {
                        const detail = detailedData[pos.symbol];
                        const isExpanded = expandedSymbol === pos.symbol;

                        return (
                          <React.Fragment key={pos.symbol}>
                            {/* ── main row ── */}
                            <tr className="group hover:bg-muted/50 transition-colors duration-200">
                              <td className="px-8 py-4">
                                <span className="text-lg font-bold tracking-tight">{pos.symbol}</span>
                                <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{pos.sector || "—"}</span>
                              </td>
                              <td className="px-6 py-4">
                                <KV label="Qty" value={String(pos.quantity)} />
                                <KV label="Entry" value={`$${pos.avg_entry_price.toFixed(2)}`} />
                                <KV label="Value" value={`$${pos.currentValue.toLocaleString()}`} accent />
                              </td>
                              <td className="px-6 py-4">
                                <div className={`text-lg font-bold tracking-tight ${pos.unrealizedPnL >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                  {pos.unrealizedPnL >= 0 ? "+" : "-"}${Math.abs(pos.unrealizedPnL).toLocaleString()}
                                </div>
                                <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${pos.unrealizedPnLPercent >= 0 ? "text-emerald-500/70" : "text-destructive/70"}`}>
                                  {pos.unrealizedPnLPercent.toFixed(2)}% ROI
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {pos.portfolioDecision ? (
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">Action</span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${decisionColor(pos.portfolioDecision)}`}>
                                        {pos.portfolioDecision}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">Signal</span>
                                      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${pos.marketDecision === 'BUY' ? 'text-emerald-500 bg-emerald-500/10' :
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
                              <td className="px-6 py-4">
                                {pos.confidence != null ? (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-xl font-bold text-primary">{(pos.confidence * 100).toFixed(0)}%</span>
                                    <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-700 ${pos.confidence >= 0.8 ? "bg-emerald-500" : pos.confidence >= 0.6 ? "bg-primary" : pos.confidence >= 0.4 ? "bg-orange-500" : "bg-destructive"
                                          }`}
                                        style={{ width: `${pos.confidence * 100}%` }}
                                      />
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider ${pos.confidence >= 0.8 ? "text-emerald-500" : pos.confidence >= 0.6 ? "text-primary" : pos.confidence >= 0.4 ? "text-orange-500" : "text-destructive"
                                      }`}>
                                      {pos.confidence >= 0.8 ? "Very High" : pos.confidence >= 0.6 ? "High" : pos.confidence >= 0.4 ? "Moderate" : "Low"}
                                    </span>
                                  </div>
                                ) : <Pulse text="—" />}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${pos.riskLevel === "HIGH" ? "text-destructive border-destructive/20 bg-destructive/5" :
                                  pos.riskLevel === "MEDIUM" ? "text-orange-500 border-orange-500/20 bg-orange-500/5" :
                                    "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                                  }`}>
                                  {pos.riskLevel || "LOW"}
                                </span>
                                <div className="mt-2">
                                  {pos.unrealizedPnLPercent < -20 ? (
                                    <Tag icon={<FiAlertCircle />} text="Critical Drawdown" scheme="rose" />
                                  ) : pos.unrealizedPnLPercent > 20 ? (
                                    <Tag icon={<FiCheckCircle />} text="High Performance" scheme="emerald" />
                                  ) : (
                                    <Tag icon={<FiActivity />} text="Stable" scheme="muted" />
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button
                                  disabled={detailLoading}
                                  onClick={() => {
                                    if (isExpanded) { setExpandedSymbol(null); return; }
                                    if (portfolioData) fetchDetailed(portfolioData.portfolioId, pos.symbol);
                                  }}
                                  variant="secondary"
                                  size="sm"
                                  className="text-[10px] font-bold"
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
                                <td colSpan={7} className="p-0">
                                  <div className="mx-6 mb-5 mt-1 rounded-2xl border border-border bg-muted/20 overflow-hidden">
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
