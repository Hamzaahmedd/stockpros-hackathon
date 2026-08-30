import api from "@/shared/api/axios";
import { ReportDownloadButton } from "@/shared/components/ReportDownloadButton";
import { Sidebar } from "@/shared/components/Sidebar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { SECONDARY_ACTION_BTN } from "@/shared/utils/buttonStyles";
import React, { useCallback, useEffect, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiGrid,
  FiList,
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
  PortfolioData,
  PortfolioRiskMetrics,
} from "../types";
import { downloadPortfolioReportCsv } from "../utils/downloadPortfolioReportCsv";
import { downloadPortfolioReportPdf } from "../utils/downloadPortfolioReportPdf";
import { computeRiskProfileLabel } from "../utils/portfolioReport";

/* ───────────── Helper Functions ───────────── */

function getRiskProfileColor(label: string): string {
  if (label === "Aggressive") return "text-rose-400";
  if (label === "Moderate") return "text-orange-400";
  if (label === "Conservative") return "text-emerald-400";
  return "text-gray-400";
}

function getDecisionBadgeClass(decision?: string): string {
  switch (decision) {
    case "ADD":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "HOLD":
      return "bg-muted text-muted-foreground border-border";
    case "TRIM":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "EXIT":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getHeatmapColorClass(roi: number): string {
  if (roi <= -20) return "bg-rose-950/70 border-rose-500 text-rose-100 shadow-rose-950/30";
  if (roi < -5) return "bg-amber-950/60 border-amber-500 text-amber-100";
  if (roi <= 5) return "bg-muted/40 border-border text-foreground";
  if (roi < 20) return "bg-emerald-950/50 border-emerald-500/70 text-emerald-100";
  return "bg-emerald-950/90 border-emerald-400 text-emerald-50 shadow-lg shadow-emerald-950/50";
}

function getBetaBadge(beta: number): { text: string; className: string } {
  if (beta > 1.2) {
    return {
      text: "High Sensitivity",
      className: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    };
  }
  if (beta < 0.8) {
    return {
      text: "Defensive",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    };
  }
  return {
    text: "Market Baseline",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };
}

function getSharpeBadge(sharpe: number): { text: string; className: string } {
  if (sharpe > 1.0) {
    return {
      text: "Superior Alpha",
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    };
  }
  if (sharpe > 0) {
    return {
      text: "Positive Risk-Adj",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    };
  }
  return {
    text: "Sub-Optimal",
    className: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500";
  if (confidence >= 0.6) return "bg-primary";
  if (confidence >= 0.4) return "bg-orange-500";
  return "bg-destructive";
}

function getConfidenceTextColor(confidence: number): string {
  if (confidence >= 0.8) return "text-emerald-500";
  if (confidence >= 0.6) return "text-primary";
  if (confidence >= 0.4) return "text-orange-500";
  return "text-destructive";
}

function getConfidenceTier(confidence: number): string {
  if (confidence >= 0.8) return "Very High";
  if (confidence >= 0.6) return "High";
  if (confidence >= 0.4) return "Moderate";
  return "Low";
}

function getSharpeTextClass(sharpe: number = 0): string {
  if (sharpe >= 1.0) return "text-emerald-500";
  if (sharpe < 0) return "text-destructive";
  return "text-primary";
}

function getMarketSignalBadge(marketDecision?: string) {
  if (marketDecision === "BUY") {
    return {
      badgeClass: "text-emerald-500 bg-emerald-500/10",
      dotClass: "bg-emerald-500",
    };
  }
  if (marketDecision === "SELL") {
    return {
      badgeClass: "text-destructive bg-destructive/10",
      dotClass: "bg-destructive",
    };
  }
  return {
    badgeClass: "bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
  };
}

function getRiskLevelBadge(riskLevel?: string): string {
  if (riskLevel === "HIGH") {
    return "text-destructive border-destructive/20 bg-destructive/5";
  }
  if (riskLevel === "MEDIUM") {
    return "text-orange-500 border-orange-500/20 bg-orange-500/5";
  }
  return "text-emerald-500 border-emerald-500/20 bg-emerald-500/5";
}

function getActionToggleButtonIcon(
  detailLoading: boolean,
  isExpanded: boolean,
): React.ReactNode {
  if (detailLoading && !isExpanded) {
    return <Skeleton className="w-3 h-3 rounded-full" />;
  }
  if (isExpanded) {
    return <FiChevronUp size={12} />;
  }
  return <FiChevronDown size={12} />;
}

/* ───────────── Sub-components ───────────── */

interface EmptyStateProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly sub: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, sub }) => (
  <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-border rounded-lg bg-card/50">
    <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-muted-foreground max-w-sm text-center text-sm">{sub}</p>
  </div>
);

interface StatCardProps {
  readonly icon: React.ReactNode;
  readonly iconCls: string;
  readonly label: string;
  readonly children: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  iconCls,
  label,
  children,
}) => (
  <Card className="rounded-lg transition-all duration-300">
    <CardContent className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconCls}`}
        >
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </CardContent>
  </Card>
);

interface KeyValueItemProps {
  readonly label: string;
  readonly value: string;
  readonly accent?: boolean;
}

const KeyValueItem: React.FC<KeyValueItemProps> = ({
  label,
  value,
  accent,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">
      {label}
    </span>
    <span className={`text-sm font-bold ${accent ? "text-primary" : ""}`}>
      {value}
    </span>
  </div>
);

interface PulseProps {
  readonly text: string;
}

const Pulse: React.FC<PulseProps> = ({ text }) => (
  <div className="flex items-center gap-2 animate-pulse">
    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
    <span className="text-xs text-muted-foreground font-medium italic">
      {text}
    </span>
  </div>
);

interface TagProps {
  readonly icon: React.ReactNode;
  readonly text: string;
  readonly scheme: "rose" | "emerald" | "muted";
}

const Tag: React.FC<TagProps> = ({ icon, text, scheme }) => {
  let schemeClasses = "text-muted-foreground bg-muted";
  if (scheme === "rose") {
    schemeClasses = "text-destructive bg-destructive/10";
  } else if (scheme === "emerald") {
    schemeClasses = "text-green-500 bg-green-500/10";
  }
  return (
    <div
      className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-transparent ${schemeClasses}`}
    >
      {icon} {text}
    </div>
  );
};

interface SectionLabelProps {
  readonly text: string;
  readonly color: string;
}

const SectionLabel: React.FC<SectionLabelProps> = ({ text, color }) => (
  <div className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>
    {text}
  </div>
);

interface ProgressBarProps {
  readonly label: string;
  readonly value: number;
  readonly warn: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, value, warn }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xs font-bold">{value.toFixed(2)}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
      <div
        className={`h-full rounded-full transition-all duration-700 ${
          warn ? "bg-destructive" : "bg-primary"
        }`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  </div>
);

/* ───────────── Risk Metrics Panel (Persona B) ───────────── */

interface RiskAuditPanelProps {
  readonly riskMetrics: PortfolioRiskMetrics;
}

const RiskAuditPanel: React.FC<RiskAuditPanelProps> = ({ riskMetrics }) => {
  const betaBadge = getBetaBadge(riskMetrics.weightedBeta);
  const sharpeBadge = getSharpeBadge(riskMetrics.portfolioSharpe);

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 space-y-6 shadow-md">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <FiActivity className="text-lg" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">
              Risk &amp; Volatility Audit
            </h3>
            <p className="text-xs text-muted-foreground font-medium">
              Portfolio-level systemic beta, Sharpe ratio efficiency, and sector
              concentration audit
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Portfolio Beta
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${betaBadge.className}`}
            >
              {betaBadge.text}
            </span>
          </div>
          <div className="text-4xl font-black text-primary">
            {riskMetrics.weightedBeta.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Weighted systemic sensitivity to broad market movements (1.0 =
            S&amp;P 500 equivalent).
          </p>
        </div>

        {/* Sharpe Ratio */}
        <div className="p-5 rounded-xl border border-border bg-background space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sharpe Ratio
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${sharpeBadge.className}`}
            >
              {sharpeBadge.text}
            </span>
          </div>
          <div className="text-4xl font-black text-primary">
            {riskMetrics.portfolioSharpe.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Risk-adjusted excess return per unit volatility over 5.25% US 3M
            risk-free benchmark.
          </p>
        </div>

        {/* Sector Concentration Mini-Bar Chart */}
        <div className="p-5 rounded-xl border border-border bg-background space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sector Concentration
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">
              Weights
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {riskMetrics.sectorConcentration.slice(0, 3).map((sc) => (
              <div key={sc.sector} className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="truncate max-w-[160px]">{sc.sector}</span>
                  <span
                    className={
                      sc.weight > 40 ? "text-rose-500" : "text-primary"
                    }
                  >
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
  );
};

/* ───────────── Heatmap View ───────────── */

interface HeatmapViewProps {
  readonly merged: MergedRow[];
  readonly expandedSymbol: string | null;
  readonly onSelectSymbol: (symbol: string) => void;
}

const HeatmapView: React.FC<HeatmapViewProps> = ({
  merged,
  expandedSymbol,
  onSelectSymbol,
}) => (
  <div className="p-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {merged.map((pos) => {
        const isExpanded = expandedSymbol === pos.symbol;
        return (
          <button
            key={pos.symbol}
            type="button"
            onClick={() => onSelectSymbol(pos.symbol)}
            className={`p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer flex flex-col justify-between select-none ${getHeatmapColorClass(
              pos.unrealizedPnLPercent,
            )} ${
              isExpanded
                ? "ring-2 ring-primary scale-[1.02]"
                : "hover:scale-[1.02]"
            }`}
          >
            <div className="flex items-start justify-between w-full">
              <span className="text-base font-black tracking-tight">
                {pos.symbol}
              </span>
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

            <div className="pt-2 border-t border-current/20 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
              <span>Action</span>
              <span className="font-black">{pos.portfolioDecision || "HOLD"}</span>
            </div>
          </button>
        );
      })}
    </div>

    {/* Heatmap Legend */}
    <div className="mt-6 flex items-center justify-center gap-6 flex-wrap text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-rose-700 border border-rose-500" />{" "}
        &lt; -20%
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-amber-700 border border-amber-500" />{" "}
        -20% to -5%
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-muted border border-border" /> -5% to
        +5%
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-emerald-700 border border-emerald-500" />{" "}
        +5% to +20%
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded bg-emerald-500 border border-emerald-300" />{" "}
        &gt; +20%
      </div>
    </div>
  </div>
);

/* ───────────── Position Detail Panel ───────────── */

interface PositionDetailPanelProps {
  readonly detail: DetailedDecision;
  readonly onClose: () => void;
}

const PositionDetailPanel: React.FC<PositionDetailPanelProps> = ({
  detail,
  onClose,
}) => (
  <tr>
    <td colSpan={9} className="p-0">
      <div className="mx-6 mb-5 mt-1 rounded-2xl border border-border bg-muted/20 overflow-hidden">
        {/* close bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Detailed Analysis — {detail.symbol}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
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
                {detail.reasoning.details.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/10"
                  >
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
              <ProgressBar
                label="Position Weight"
                value={detail.exposure.positionPercent}
                warn={detail.exposure.positionPercent > 15}
              />
              <ProgressBar
                label="Sector Exposure"
                value={detail.exposure.sectorPercent}
                warn={detail.exposure.sectorPercent > 40}
              />
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
                {Object.entries(detail.actionGuidance.positionStrategy).map(
                  ([k, v]) => (
                    <span
                      key={k}
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        v
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-muted text-muted-foreground/30 border-border line-through opacity-30"
                      }`}
                    >
                      {k}
                    </span>
                  ),
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">
                    Take Profit
                  </span>
                  <span className="text-sm font-bold text-emerald-500">
                    ${detail.actionGuidance.takeProfitZone}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">
                    Stop Loss
                  </span>
                  <span className="text-sm font-bold text-destructive">
                    ${detail.actionGuidance.stopLossZone}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">
                  Hold Duration
                </span>
                <span className="text-sm font-bold">
                  {detail.actionGuidance.holdDuration}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.actionGuidance.watchFor.map((w) => (
                  <span
                    key={w}
                    className="text-[9px] font-bold px-2 py-0.5 rounded border border-border bg-background text-muted-foreground"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </td>
  </tr>
);

/* ───────────── Position Table Row Component ───────────── */

interface PositionTableRowProps {
  readonly pos: MergedRow;
  readonly isExpanded: boolean;
  readonly detail?: DetailedDecision;
  readonly detailLoading: boolean;
  readonly onToggleExpansion: (symbol: string) => void;
  readonly onCloseDetail: () => void;
}

const PositionTableRow: React.FC<PositionTableRowProps> = ({
  pos,
  isExpanded,
  detail,
  detailLoading,
  onToggleExpansion,
  onCloseDetail,
}) => {
  const signal = getMarketSignalBadge(pos.marketDecision);
  const riskBadgeClass = getRiskLevelBadge(pos.riskLevel);

  let pnlTagScheme: "rose" | "emerald" | "muted" = "muted";
  let pnlTagText = "Stable";
  let pnlTagIcon = <FiActivity />;
  if (pos.unrealizedPnLPercent < -20) {
    pnlTagScheme = "rose";
    pnlTagText = "Critical";
    pnlTagIcon = <FiAlertCircle />;
  } else if (pos.unrealizedPnLPercent > 20) {
    pnlTagScheme = "emerald";
    pnlTagText = "Strong";
    pnlTagIcon = <FiCheckCircle />;
  }

  return (
    <React.Fragment>
      <tr
        onClick={() => onToggleExpansion(pos.symbol)}
        className="group hover:bg-muted/50 transition-colors duration-200 cursor-pointer"
      >
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div>
              <span className="text-base font-black tracking-tight">
                {pos.symbol}
              </span>
              <span className="block text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                {pos.sector || "—"}
              </span>
            </div>
            <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary">
              {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          <KeyValueItem label="Qty" value={String(pos.quantity)} />
          <KeyValueItem
            label="Entry"
            value={`$${pos.avg_entry_price.toFixed(2)}`}
          />
          <KeyValueItem
            label="Value"
            value={`$${pos.currentValue.toLocaleString()}`}
            accent
          />
        </td>
        <td className="px-4 py-3.5">
          <div
            className={`text-base font-bold tracking-tight ${
              pos.unrealizedPnL >= 0 ? "text-emerald-500" : "text-destructive"
            }`}
          >
            {pos.unrealizedPnL >= 0 ? "+" : "-"}$
            {Math.abs(pos.unrealizedPnL).toLocaleString()}
          </div>
          <div
            className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
              pos.unrealizedPnLPercent >= 0
                ? "text-emerald-500/70"
                : "text-destructive/70"
            }`}
          >
            {pos.unrealizedPnLPercent.toFixed(2)}% ROI
          </div>
        </td>
        <td className="px-3 py-3.5 text-center">
          <span className="text-xs font-bold text-primary font-mono">
            {pos.beta != null ? pos.beta.toFixed(2) : "1.00"}
          </span>
        </td>
        <td className="px-3 py-3.5 text-center">
          <span
            className={`text-xs font-bold font-mono ${getSharpeTextClass(
              pos.sharpe,
            )}`}
          >
            {pos.sharpe != null ? pos.sharpe.toFixed(2) : "—"}
          </span>
        </td>
        <td className="px-4 py-3.5">
          {pos.portfolioDecision ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">
                  Action
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${getDecisionBadgeClass(
                    pos.portfolioDecision,
                  )}`}
                >
                  {pos.portfolioDecision}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap opacity-60">
                  Signal
                </span>
                <span
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${signal.badgeClass}`}
                >
                  <div className={`w-1 h-1 rounded-full ${signal.dotClass}`} />
                  {pos.marketDecision}
                </span>
              </div>
            </div>
          ) : (
            <Pulse text="Analyzing..." />
          )}
        </td>
        <td className="px-4 py-3.5">
          {pos.confidence != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-base font-black text-primary">
                {(pos.confidence * 100).toFixed(0)}%
              </span>
              <div className="w-14 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${getConfidenceColor(
                    pos.confidence,
                  )}`}
                  style={{
                    width: `${pos.confidence * 100}%`,
                  }}
                />
              </div>
              <span
                className={`text-[8px] font-bold uppercase tracking-wider ${getConfidenceTextColor(
                  pos.confidence,
                )}`}
              >
                {getConfidenceTier(pos.confidence)}
              </span>
            </div>
          ) : (
            <Pulse text="—" />
          )}
        </td>
        <td className="px-4 py-3.5">
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded border ${riskBadgeClass}`}
          >
            {pos.riskLevel || "LOW"}
          </span>
          <div className="mt-1.5">
            <Tag icon={pnlTagIcon} text={pnlTagText} scheme={pnlTagScheme} />
          </div>
        </td>
        <td className="px-4 py-3.5 text-right sticky right-0 bg-card/95 backdrop-blur group-hover:bg-muted/50 transition-colors shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.15)]">
          <Button
            type="button"
            disabled={detailLoading}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpansion(pos.symbol);
            }}
            variant="secondary"
            size="sm"
            className={`text-[10px] font-bold ${SECONDARY_ACTION_BTN}`}
          >
            {getActionToggleButtonIcon(detailLoading, isExpanded)}
            {isExpanded ? "Hide" : "View"}
          </Button>
        </td>
      </tr>

      {isExpanded && detail && (
        <PositionDetailPanel detail={detail} onClose={onCloseDetail} />
      )}
    </React.Fragment>
  );
};

/* ───────────── Main Content Area ───────────── */

interface MainPortfolioContentProps {
  readonly pageLoading: boolean;
  readonly portfolioData: PortfolioData | null;
  readonly riskMetrics: PortfolioRiskMetrics | null;
  readonly riskProfileLabel: string;
  readonly riskProfileColor: string;
  readonly viewMode: "list" | "heatmap";
  readonly onViewModeChange: (mode: "list" | "heatmap") => void;
  readonly overviewLoading: boolean;
  readonly merged: MergedRow[];
  readonly expandedSymbol: string | null;
  readonly detailedData: Record<string, DetailedDecision>;
  readonly detailLoading: boolean;
  readonly onToggleExpansion: (symbol: string) => void;
  readonly onCloseDetail: () => void;
}

const MainPortfolioContent: React.FC<MainPortfolioContentProps> = ({
  pageLoading,
  portfolioData,
  riskMetrics,
  riskProfileLabel,
  riskProfileColor,
  viewMode,
  onViewModeChange,
  overviewLoading,
  merged,
  expandedSymbol,
  detailedData,
  detailLoading,
  onToggleExpansion,
  onCloseDetail,
}) => {
  if (pageLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`summary-skel-${i}`}
              className="border border-border rounded-lg p-6 bg-card space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="w-8 h-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <EmptyState
        icon={<FiBriefcase size={40} />}
        title="No Portfolio Active"
        sub="Upload your equity portfolio (CSV/Excel) to receive real-time health analysis and AI trade recommendations."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<FiPieChart />}
          iconCls="bg-blue-500/10 text-blue-500"
          label="Market Value"
        >
          <span className="text-2xl md:text-3xl font-bold tracking-tight">
            ${portfolioData.summary.totalMarketValue.toLocaleString()}
          </span>
          <span className="block text-[10px] text-muted-foreground mt-1 font-medium">
            Current Portfolio Equity
          </span>
        </StatCard>

        <StatCard
          icon={<FiTrendingUp />}
          iconCls="bg-primary/10 text-primary"
          label="Unrealized PnL"
        >
          <span
            className={`text-2xl md:text-3xl font-bold tracking-tight ${
              portfolioData.summary.totalUnrealizedPnL >= 0
                ? "text-green-500"
                : "text-destructive"
            }`}
          >
            {portfolioData.summary.totalUnrealizedPnL >= 0 ? "+" : ""}
            ${Math.abs(portfolioData.summary.totalUnrealizedPnL).toLocaleString()}
          </span>
          <span
            className={`block text-[10px] font-bold mt-1 ${
              portfolioData.summary.totalUnrealizedPnL >= 0
                ? "text-green-500/70"
                : "text-destructive/70"
            }`}
          >
            {portfolioData.summary.totalUnrealizedPnLPercent.toFixed(2)}% Overall
            ROI
          </span>
        </StatCard>

        <StatCard
          icon={<FiTarget />}
          iconCls="bg-purple-500/10 text-purple-500"
          label="Positions"
        >
          <span className="text-2xl md:text-3xl font-bold tracking-tight">
            {portfolioData.summary.totalPositions}
          </span>
          <span className="block text-[10px] text-muted-foreground mt-1 font-medium">
            Active Equity Tickers
          </span>
        </StatCard>

        <StatCard
          icon={<FiShield />}
          iconCls="bg-orange-500/10 text-orange-500"
          label="Risk Profile"
        >
          <span
            className={`text-2xl md:text-3xl font-bold tracking-tight italic ${riskProfileColor}`}
          >
            {riskProfileLabel}
          </span>
          <span className="block text-[10px] text-muted-foreground mt-1 font-medium italic">
            AI Computed Rating
          </span>
        </StatCard>
      </div>

      {/* Persona B Risk Metrics */}
      {riskMetrics && <RiskAuditPanel riskMetrics={riskMetrics} />}

      {/* View Mode Switcher & Content */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <FiActivity className="text-primary" />
              Asset Allocation &amp; Decision Intelligence
            </h3>

            <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border ml-2">
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FiList size={12} /> List View
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("heatmap")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === "heatmap"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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

        {viewMode === "heatmap" ? (
          <HeatmapView
            merged={merged}
            expandedSymbol={expandedSymbol}
            onSelectSymbol={onToggleExpansion}
          />
        ) : (
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
                  <th className="px-4 py-3.5 text-right sticky right-0 bg-card/95 backdrop-blur shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.15)]">
                    Analysis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {merged.map((pos) => (
                  <PositionTableRow
                    key={pos.symbol}
                    pos={pos}
                    isExpanded={expandedSymbol === pos.symbol}
                    detail={detailedData[pos.symbol]}
                    detailLoading={detailLoading}
                    onToggleExpansion={onToggleExpansion}
                    onCloseDetail={onCloseDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ───────────── Main Portfolio Health Component ───────────── */

export const PortfolioHealth: React.FC = () => {
  const [pageLoading, setPageLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<PortfolioRiskMetrics | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"list" | "heatmap">("list");

  const [overviewDecisions, setOverviewDecisions] = useState<
    OverviewDecision[]
  >([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<
    Record<string, DetailedDecision>
  >({});

  const fetchOverview = useCallback(async (portfolioId: string) => {
    try {
      setOverviewLoading(true);
      const [decisionRes, riskRes] = await Promise.all([
        api.post("/api/v1/decision-support/portfolio/decision", {
          portfolioId,
          decisionMode: "OVERVIEW",
        }),
        api
          .post("/api/v1/decision-support/portfolio/risk-metrics", {
            portfolioId,
          })
          .catch((err) => {
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

  const fetchDetailed = useCallback(
    async (portfolioId: string, symbol: string) => {
      if (detailedData[symbol]) {
        setExpandedSymbol(symbol);
        return;
      }
      try {
        setDetailLoading(true);
        const res = await api.post(
          "/api/v1/decision-support/portfolio/decision",
          {
            portfolioId,
            decisionMode: "DETAILED",
          },
        );
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
    },
    [detailedData],
  );

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
  }, [fetchOverview]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("portfolio", file);
    try {
      setUploading(true);
      const res = await api.post(
        "/api/v1/decision-support/upload-portfolio",
        fd,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
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

  const handleDownloadReport = async (format: "csv" | "pdf") => {
    if (!portfolioData) return;
    try {
      setReportLoading(true);
      const res = await api.post(
        "/api/v1/decision-support/portfolio/decision",
        {
          portfolioId: portfolioData.portfolioId,
          decisionMode: "DETAILED",
        },
      );
      if (!res.data.success) {
        toast.error("Failed to generate report");
        return;
      }

      const detailedPositions: DetailedDecision[] = res.data.data.positions;
      if (format === "csv") {
        downloadPortfolioReportCsv(
          portfolioData,
          detailedPositions,
          riskMetrics,
        );
        toast.success("Report downloaded as CSV");
      } else {
        downloadPortfolioReportPdf(
          portfolioData,
          detailedPositions,
          riskMetrics,
        );
        toast.success("Report downloaded as PDF");
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  const merged: MergedRow[] = (portfolioData?.positions ?? []).map((p) => {
    const d = overviewDecisions.find((dd) => dd.symbol === p.symbol);
    const rm = riskMetrics?.perSymbol?.find((ps) => ps.symbol === p.symbol);
    return {
      ...p,
      ...d,
      beta: rm?.beta ?? d?.beta ?? 1.0,
      sharpe: rm?.sharpe ?? d?.sharpe ?? 0,
      volatilityAnnualized:
        rm?.volatilityAnnualized ?? d?.volatilityAnnualized ?? 0,
    };
  });

  const riskProfileLabel = computeRiskProfileLabel(overviewDecisions);
  const riskProfileColor = getRiskProfileColor(riskProfileLabel);

  const toggleRowExpansion = (symbol: string) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      return;
    }
    if (portfolioData) {
      fetchDetailed(portfolioData.portfolioId, symbol);
    }
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1440px] mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/60 pb-6">
            <div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
                Portfolio Health
              </h1>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mt-1 opacity-80">
                AI-Driven Portfolio Optimization &amp; Quantitative Risk
                Intelligence
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
              <label
                className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer font-bold text-xs transition-all duration-200 ${
                  uploading
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {uploading ? (
                  <Skeleton className="w-4 h-4 rounded-full" />
                ) : (
                  <FiUpload />
                )}
                {uploading ? "Processing..." : "Upload Portfolio"}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                  accept=".csv,.xlsx,.xls"
                />
              </label>
            </div>
          </div>

          <MainPortfolioContent
            pageLoading={pageLoading}
            portfolioData={portfolioData}
            riskMetrics={riskMetrics}
            riskProfileLabel={riskProfileLabel}
            riskProfileColor={riskProfileColor}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            overviewLoading={overviewLoading}
            merged={merged}
            expandedSymbol={expandedSymbol}
            detailedData={detailedData}
            detailLoading={detailLoading}
            onToggleExpansion={toggleRowExpansion}
            onCloseDetail={() => setExpandedSymbol(null)}
          />
        </div>
      </main>
    </div>
  );
};

export default PortfolioHealth;
