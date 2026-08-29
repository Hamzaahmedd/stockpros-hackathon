import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { SmartSearch } from "@/shared/components/SmartSearch";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTheme } from "@/shared/hooks/useTheme";
import React, { useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiClock,
  FiInfo,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
  FiZap
} from 'react-icons/fi';

interface TradingViewWidgetProps {
  symbol: string;
  theme: string;
}

const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ symbol, theme }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `NASDAQ:${symbol}`,
      interval: "D",
      timezone: "Asia/Karachi",
      theme,
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      container_id: "tradingview_analysis",
    });

    container.current.innerHTML = "";
    container.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
};

const MarketAnalysis: React.FC = () => {
  const { theme } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null);

  const fetchDecision = async (symbol: string, silent = false) => {
    const trimmed = symbol?.trim();
    if (!trimmed) {
      setData(null);
      setCurrentSymbol(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
        setError(null);
        setData(null);
      }

      const res = await api.get(
        `/api/v1/decision-support/market/decision/${trimmed}`
      );

      setData(res.data.data);
      setCurrentSymbol(trimmed);
    } catch (err) {
      if (!silent) {
        console.warn(`[MarketAnalysis] fetchDecision failed for ${trimmed}:`, err);
        setError("No data found for this symbol");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Real-time polling
  React.useEffect(() => {
    if (!currentSymbol) return;
    const interval = setInterval(() => {
      fetchDecision(currentSymbol, true);
    }, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, [currentSymbol]);

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto space-y-8">
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                Market Analysis
              </h1>
              <p className="text-muted-foreground text-sm mt-1 font-medium italic">Precision decision support powered by Intelligence Protocols</p>
            </div>
          </div>

          {/* SEARCH */}
          <div className="max-w-2xl">
            <SmartSearch onSubmit={fetchDecision} />
          </div>

          {/* STATES */}
          {loading && (
            <div className="space-y-6">
              {/* Main Header & Chart Section Skeleton */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Price Card & Chart Skeleton */}
                <div className="lg:col-span-2 rounded-lg border border-border overflow-hidden bg-card shadow-lg p-8 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-16 rounded" />
                        <Skeleton className="h-3 w-20 rounded" />
                      </div>
                      <Skeleton className="h-12 w-32 rounded-lg" />
                      <Skeleton className="h-3 w-40 rounded" />
                    </div>
                    <div className="space-y-2 flex flex-col items-end">
                      <Skeleton className="h-3 w-20 rounded" />
                      <Skeleton className="h-10 w-28 rounded-md" />
                      <Skeleton className="h-4 w-16 rounded" />
                    </div>
                  </div>

                  {/* Chart Placeholder Skeleton */}
                  <div className="h-[450px] w-full rounded-lg bg-muted/20 border border-border/50 p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-12 rounded" />
                        <Skeleton className="h-6 w-12 rounded" />
                        <Skeleton className="h-6 w-12 rounded" />
                      </div>
                      <Skeleton className="h-6 w-24 rounded" />
                    </div>
                    {/* Simulated chart wave / gridlines */}
                    <div className="space-y-8 w-full py-8">
                      <Skeleton className="h-0.5 w-full bg-border/40" />
                      <Skeleton className="h-0.5 w-full bg-border/40" />
                      <Skeleton className="h-0.5 w-full bg-border/40" />
                      <Skeleton className="h-0.5 w-full bg-border/40" />
                    </div>
                    <div className="flex justify-between">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-3 w-10 rounded" />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex gap-6">
                      <Skeleton className="h-4 w-24 rounded" />
                      <Skeleton className="h-4 w-20 rounded" />
                    </div>
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                </div>

                {/* AI Executive Decision Card Skeleton */}
                <div className="rounded-lg border border-border bg-card p-6 flex flex-col justify-between shadow-xl space-y-6">
                  <div>
                    <div className="flex items-center gap-3 mb-8">
                      <Skeleton className="w-8 h-8 rounded-lg" />
                      <Skeleton className="h-4 w-28 rounded" />
                    </div>
                    <div className="mb-10 space-y-3">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-10 w-44 rounded-md" />
                      <Skeleton className="h-2 w-full rounded-full" />
                      <div className="flex justify-between">
                        <Skeleton className="h-3 w-24 rounded" />
                        <Skeleton className="h-4 w-12 rounded" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="w-6 h-6 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-20 rounded" />
                          <Skeleton className="h-4 w-24 rounded" />
                        </div>
                      </div>
                      <div className="w-full border-t border-border/50" />
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-28 rounded" />
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-4 w-2/3 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Grid Skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-8 rounded-lg border border-border bg-card space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Skeleton className="w-6 h-6 rounded-full" />
                      <Skeleton className="h-3.5 w-32 rounded" />
                    </div>
                    <Skeleton className="h-9 w-20 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-3 w-4/5 rounded" />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {error && (
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 flex items-center gap-3">
              <FiInfo className="text-xl" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {/* DATA */}
          {data && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6">
              
              {/* Main Header & Chart Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Price Card & Chart */}
                <div className="lg:col-span-2 rounded-lg border border-border overflow-hidden bg-card shadow-lg transition-all duration-300">
                  <div className="p-8 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          data.marketContext.marketStatus === 'OPEN' 
                          ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                          : 'bg-muted text-muted-foreground border border-border'
                        }`}>
                          {data.marketContext.marketStatus}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Market Status</span>
                      </div>
                      <h2 className="text-5xl font-bold tracking-tight mb-1 italic">{data.symbol}</h2>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest leading-none">{data.symbol} Stock Analysis</p>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Current Price</div>
                      <div className="text-4xl font-bold tracking-tight text-foreground">{data.priceState.current.toLocaleString()}</div>
                      <div className={`flex items-center justify-end font-bold text-sm mt-2 ${data.priceState.trend === "UP" ? "text-green-500" : "text-destructive"}`}>
                        {data.priceState.trend === "UP" ? <FiTrendingUp className="mr-1.5" /> : <FiTrendingDown className="mr-1.5" />}
                        {data.priceState.trend}
                      </div>
                    </div>
                  </div>

                  {/* Chart Area */}
                  <div className="h-[450px] w-full px-2 pb-2">
                    <TradingViewWidget symbol={data.symbol} theme={theme} />
                  </div>
                  
                  <div className="px-8 py-4 border-t border-border flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Prev Close</span>
                          <span className="text-xs font-bold">{data.marketContext.lastClosePrice}</span>
                       </div>
                       <div className="w-px h-6 bg-border" />
                       <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">RSI (14)</span>
                          <span className={`text-xs font-bold ${data.priceState.isOverbought ? 'text-destructive' : 'text-primary'}`}>{data.priceState.rsi}</span>
                       </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium italic opacity-60">
                       Updated: {new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* AI Executive Decision Card */}
                <div className="rounded-lg border border-border bg-card p-6 flex flex-col justify-between shadow-xl">
                    <div>
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <FiZap className="text-lg" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">AI Signal Pulse</span>
                      </div>

                      <div className="mb-10">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-2">Recommendation</span>
                        <h3 className="text-4xl font-bold tracking-tight mb-4 uppercase italic decoration-primary/30 underline-offset-8">{data.decision.recommendation}</h3>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-primary transition-all duration-1000" 
                             style={{ width: `${data.decision.confidence * 100}%` }}
                           />
                        </div>
                        <div className="flex items-center justify-between mt-3">
                           <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Confidence Level</span>
                           <span className="text-sm font-bold text-primary">{(data.decision.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <FiClock className="text-muted-foreground text-lg" />
                          <div>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Time Horizon</p>
                            <p className="text-xs font-bold">{data.decision.timeHorizon}</p>
                          </div>
                        </div>
                        <div className="w-full border-t border-border/50 border-dashed" />
                        <div className="space-y-3">
                           <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-2">
                             <FiTarget className="text-primary" /> Action Guidance
                           </p>
                           <div className="space-y-2 pl-6">
                              {data.actionGuidance.buyWindow && <div className="text-xs font-bold text-green-500"><span className="text-muted-foreground font-medium uppercase tracking-tighter mr-1">BUY:</span> {data.actionGuidance.buyWindow}</div>}
                              {data.actionGuidance.holdWindow && <div className="text-xs font-bold text-amber-500"><span className="text-muted-foreground font-medium uppercase tracking-tighter mr-1">HOLD:</span> {data.actionGuidance.holdWindow}</div>}
                              {data.actionGuidance.sellWindow && <div className="text-xs font-bold text-destructive"><span className="text-muted-foreground font-medium uppercase tracking-tighter mr-1">SELL:</span> {data.actionGuidance.sellWindow}</div>}
                              {data.actionGuidance.watchFor && <div className="text-[11px] text-blue-500 font-bold italic">"Watch {data.actionGuidance.watchFor}"</div>}
                           </div>
                        </div>
                      </div>
                    </div>
                </div>
              </div>

              {/* Analytics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Analyst Consensus */}
                <div className="p-8 rounded-lg border border-border bg-card transition-all duration-300 group hover:border-border/80">
                  <div className="flex items-center gap-3 mb-6">
                    <FiUsers className="text-lg text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Analyst Consensus</span>
                  </div>
                  <div className="text-4xl font-bold tracking-tight text-primary mb-2">
                    {data.analystConsensus.confidencePercent}%
                  </div>
                  <div className="text-base font-bold mb-2 uppercase tracking-wide italic">
                    {data.analystConsensus.rating}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    Aggregate sentiment based on <span className="text-foreground font-bold">{data.analystConsensus.sourceCount} professional analysts</span>.
                  </p>
                </div>

                {/* Market Indicators / Sentiment */}
                <div className="p-8 rounded-lg border border-border bg-card transition-all duration-300 group hover:border-border/80">
                  <div className="flex items-center gap-3 mb-6">
                    <FiActivity className="text-lg text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sentiment Engine</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-6">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Score</p>
                      <p className="text-xl font-bold">{data.sentimentState.score.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Trend</p>
                      <p className="text-xl font-bold text-primary uppercase italic">{data.sentimentState.trend}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">48H Change</p>
                      <p className={`text-xl font-bold ${data.sentimentState.change48hPercent >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        {data.sentimentState.change48hPercent}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Buzz Volume</p>
                      <p className="text-xl font-bold">{data.sentimentState.newsVolume}</p>
                    </div>
                  </div>
                </div>

                {/* Reasoning Detail */}
                <div className="p-8 rounded-lg border border-border bg-card transition-all duration-300 group hover:border-border/80">
                   <div className="flex items-center gap-3 mb-6">
                    <FiInfo className="text-lg text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Intelligence Brief</span>
                  </div>
                  <ul className="space-y-4">
                    {data.reasoning.details && data.reasoning.details.length > 0 ? (
                      data.reasoning.details.map((detail: string) => (
                        <li key={detail} className="flex items-start gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <span className="text-xs font-medium leading-relaxed tracking-wide text-muted-foreground">{detail}</span>
                        </li>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground font-bold italic py-4 flex flex-col items-center gap-3 opacity-60">
                         <FiInfo className="text-lg" />
                         <span>Streaming real-time logic...</span>
                      </div>
                    )}
                  </ul>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MarketAnalysis;

