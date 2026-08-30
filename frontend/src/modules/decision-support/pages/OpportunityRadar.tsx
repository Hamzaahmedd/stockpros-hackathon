// frontend/src/modules/decision-support/pages/OpportunityRadar.tsx
import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { SmartSearch } from "@/shared/components/SmartSearch";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTheme } from "@/shared/hooks/useTheme";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiActivity,
  FiArrowUpRight,
  FiAward,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiDownload,
  FiFilter,
  FiPercent,
  FiRadio,
  FiShield,
  FiSliders,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
  FiX,
  FiZap,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { PositionSizeResult, RadarCard } from "../types";
import { downloadTradePlanPdf } from "../utils/downloadTradePlanPdf";

export const OpportunityRadar: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [timeline, setTimeline] = useState<'1D' | '1W'>('1D');
  const [cards, setCards] = useState<RadarCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Capital Calculator Modal State
  const [activeCard, setActiveCard] = useState<RadarCard | null>(null);
  const [capitalInput, setCapitalInput] = useState<number>(10000);
  const [sizingResult, setSizingResult] = useState<PositionSizeResult | null>(null);
  const [calculatingSize, setCalculatingSize] = useState(false);

  // Fetch radar cards
  const fetchRadar = async (t: '1D' | '1W') => {
    try {
      setLoading(true);
      const res = await api.get(`/api/v1/decision-support/market/radar?timeline=${t}`);
      if (res.data.success && Array.isArray(res.data.data)) {
        setCards(res.data.data);
      }
    } catch (err: any) {
      console.error("[OpportunityRadar] Fetch failed", err);
      toast.error("Failed to load Opportunity Radar data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRadar(timeline);
  }, [timeline]);

  // Extract unique sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.sector) set.add(c.sector);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [cards]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    if (selectedSector === 'ALL') return cards;
    return cards.filter((c) => c.sector === selectedSector);
  }, [cards, selectedSector]);

  // Position Sizing calculation
  const handleCalculateSize = async (card: RadarCard, capital: number) => {
    try {
      setCalculatingSize(true);
      const res = await api.post("/api/v1/decision-support/market/position-size", {
        symbol: card.symbol,
        capital,
      });
      if (res.data.success && res.data.data) {
        setSizingResult(res.data.data);
      }
    } catch (err: any) {
      console.error("Position sizing calculation failed", err);
      // Fallback local calculation
      const shares = Math.floor(capital / card.currentPrice);
      const riskPerShare = Math.max(0, card.currentPrice - card.stopLoss);
      const totalRisk = Number((shares * riskPerShare).toFixed(2));
      const potentialGain = Number((shares * Math.max(0, card.bullTarget - card.currentPrice)).toFixed(2));
      const riskRewardRatio = totalRisk > 0 ? Number((potentialGain / totalRisk).toFixed(2)) : 0;
      const percentOfCapital = Number(((shares * card.currentPrice) / capital * 100).toFixed(2));

      setSizingResult({
        symbol: card.symbol,
        capital,
        currentPrice: card.currentPrice,
        stopLoss: card.stopLoss,
        bullTarget: card.bullTarget,
        atr: card.atr,
        recommendation: card.recommendation,
        confidence: card.confidence,
        shares,
        riskPerShare,
        totalRisk,
        potentialGain,
        riskRewardRatio,
        percentOfCapital,
      });
    } finally {
      setCalculatingSize(false);
    }
  };

  const openCalculator = (card: RadarCard) => {
    setActiveCard(card);
    setCapitalInput(10000);
    handleCalculateSize(card, 10000);
  };

  const handleSearchSubmit = (symbol: string) => {
    if (symbol?.trim()) {
      navigate(`/decision-support/market-analysis?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`);
    }
  };

  const getRecommendationBadge = (rec: string) => {
    if (rec.includes('BUY')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
          <FiTrendingUp className="text-xs" /> {rec}
        </span>
      );
    }
    if (rec.includes('SELL')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/30">
          <FiTrendingDown className="text-xs" /> {rec}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/30">
        <FiActivity className="text-xs" /> {rec}
      </span>
    );
  };

  const getConfidenceBadge = (confidence: number, label?: string) => {
    const pct = Math.round(confidence * 100);
    const color =
      pct >= 70
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        : pct >= 40
        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
        : "text-rose-400 bg-rose-500/10 border-rose-500/20";

    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${color}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {label || (pct >= 70 ? 'HIGH' : pct >= 40 ? 'MEDIUM' : 'LOW')} {pct}%
      </span>
    );
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1440px] mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                  <FiRadio className="text-xl animate-pulse" />
                </div>
                <div>
                  <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
                    AI Opportunity Radar
                  </h1>
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase mt-0.5">
                    Live Algorithmic Market Scanner &amp; Quantitative Setup Detector
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline Filter Switcher */}
            <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-xl border border-border">
              <button
                onClick={() => setTimeline('1D')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  timeline === '1D'
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FiZap className="text-xs" />
                1D (Swing / Day)
              </button>
              <button
                onClick={() => setTimeline('1W')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  timeline === '1W'
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FiClock className="text-xs" />
                1W (Position)
              </button>
            </div>
          </div>

          {/* Unified Search & Sector Filter Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-8">
              <SmartSearch onSubmit={handleSearchSubmit} placeholder="Search any ticker (e.g. AAPL, NVDA, MSFT) for standardized analysis..." />
            </div>

            {/* Sector Dropdown / Pills */}
            <div className="lg:col-span-4 flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold shrink-0 mr-1">
                <FiFilter size={14} /> Sector:
              </div>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full bg-card border border-border text-foreground text-xs font-bold rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {sectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 'ALL' ? 'All Sectors' : sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Radar Grid Section */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-md">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-20 rounded" />
                      <Skeleton className="h-3 w-28 rounded" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-32 rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                    <Skeleton className="h-10 rounded" />
                    <Skeleton className="h-10 rounded" />
                    <Skeleton className="h-10 rounded" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-9 flex-1 rounded" />
                    <Skeleton className="h-9 flex-1 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl bg-card/30">
              <FiRadio className="mx-auto text-4xl text-muted-foreground mb-3 opacity-40" />
              <h3 className="text-lg font-bold">No High-Confidence Signals Detected</h3>
              <p className="text-muted-foreground text-xs mt-1">
                Try switching timelines or selecting "All Sectors" to discover opportunities.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCards.map((card) => (
                <div
                  key={card.symbol}
                  className="rounded-2xl border border-border/80 bg-card p-6 flex flex-col justify-between transition-all duration-300 hover:border-primary/50 hover:shadow-xl group"
                >
                  <div>
                    {/* Top Bar: Symbol + Recommendation */}
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-black tracking-tight">{card.symbol}</h2>
                          {getConfidenceBadge(card.confidence, card.confidenceLabel)}
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mt-0.5">
                          {card.sector || "Equities"}
                        </span>
                      </div>
                      <div>{getRecommendationBadge(card.recommendation)}</div>
                    </div>

                    {/* Current Price & ATR */}
                    <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/60">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">
                          Current Price
                        </span>
                        <span className="text-3xl font-black tracking-tight">
                          ${card.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">
                          Daily ATR (14)
                        </span>
                        <span className="text-sm font-bold text-primary">
                          ±${card.atr.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Price Targets & Entry Range */}
                    <div className="space-y-3 mb-6 bg-muted/20 p-4 rounded-xl border border-border/50">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" /> Entry Range:
                        </span>
                        <span className="font-bold">
                          ${card.entryRange.low.toFixed(2)} – ${card.entryRange.high.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Bull Target (+2 ATR):
                        </span>
                        <span className="font-bold text-emerald-500">
                          ${card.bullTarget.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500" /> Stop-Loss (-1.5 ATR):
                        </span>
                        <span className="font-bold text-rose-500">
                          ${card.stopLoss.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Risk Flags Mini */}
                    {card.riskFlags && card.riskFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-6">
                        {card.riskFlags.slice(0, 2).map((rf, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                          >
                            {rf.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/decision-support/market-analysis?symbol=${card.symbol}`)}
                      className="text-xs font-bold border-border hover:bg-secondary flex items-center justify-center gap-1.5"
                    >
                      <FiArrowUpRight size={14} /> Analyze
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openCalculator(card)}
                      className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <FiSliders size={14} /> Size Position
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Capital Calculator Modal */}
          {activeCard && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={() => setActiveCard(null)}
              />

              {/* Modal Container */}
              <div className="relative w-full max-w-[620px] max-h-[90vh] overflow-y-auto bg-card border border-border p-6 sm:p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border-border/60">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black text-sm">
                        {activeCard.symbol.slice(0, 2)}
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">
                        Capital &amp; Position Sizer
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Calculate optimal share sizing, risk bounds, and reward ratios based on standardized ATR targets.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveCard(null)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors"
                  >
                    <FiX size={20} />
                  </button>
                </div>

                <div className="space-y-6 pt-4">
                  {/* Budget Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Total Allocation Budget ($ USD)</span>
                      <span className="text-primary font-mono font-bold">${capitalInput.toLocaleString()}</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                        <FiDollarSign />
                      </div>
                      <Input
                        type="number"
                        value={capitalInput}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 0);
                          setCapitalInput(val);
                          handleCalculateSize(activeCard, val);
                        }}
                        min={100}
                        max={10000000}
                        step={500}
                        className="pl-9 text-base font-bold bg-background border-border"
                      />
                    </div>
                  </div>

                  {/* Level Snapshot Grid */}
                  <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-muted/30 border border-border text-center">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Price</span>
                      <span className="text-sm font-bold">${activeCard.currentPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Stop Loss</span>
                      <span className="text-sm font-bold text-rose-500">${activeCard.stopLoss.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Bull Target</span>
                      <span className="text-sm font-bold text-emerald-500">${activeCard.bullTarget.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Sizing Outputs */}
                  {sizingResult && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-xl border border-border bg-background space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <FiAward className="text-primary" /> Shares
                          </span>
                          <div className="text-2xl font-black text-primary">{sizingResult.shares}</div>
                          <span className="text-[10px] text-muted-foreground font-medium">units</span>
                        </div>

                        <div className="p-4 rounded-xl border border-border bg-background space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <FiShield className="text-rose-500" /> Max Risk
                          </span>
                          <div className="text-2xl font-black text-rose-500">${sizingResult.totalRisk.toLocaleString()}</div>
                          <span className="text-[10px] text-rose-400 font-medium">
                            ${sizingResult.riskPerShare.toFixed(2)}/share
                          </span>
                        </div>

                        <div className="p-4 rounded-xl border border-border bg-background space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <FiTarget className="text-emerald-500" /> Potential Gain
                          </span>
                          <div className="text-2xl font-black text-emerald-500">+${sizingResult.potentialGain.toLocaleString()}</div>
                          <span className="text-[10px] text-emerald-400 font-medium">at Bull Target</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">Risk / Reward Ratio</span>
                          <span className="text-sm font-black text-primary">{sizingResult.riskRewardRatio.toFixed(2)} : 1</span>
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">% Capital Allocated</span>
                          <span className="text-sm font-black">{sizingResult.percentOfCapital.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Modal Footer / PDF Export */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setActiveCard(null)}
                      className="text-xs font-bold"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => {
                        if (activeCard && sizingResult) {
                          downloadTradePlanPdf({ ...activeCard, sizing: sizingResult });
                          toast.success(`Trade Plan PDF generated for ${activeCard.symbol}`);
                        }
                      }}
                      className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                    >
                      <FiDownload size={14} /> Download Trade Plan (PDF)
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        </div>
      </main>
    </div>
  );
};

export default OpportunityRadar;
