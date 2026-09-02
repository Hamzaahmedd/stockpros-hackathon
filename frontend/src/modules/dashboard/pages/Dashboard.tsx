import { useAuth } from "@/modules/auth/hooks/useAuth";
import { fetchDashboardData } from "../services";
import { Sidebar } from "@/shared/components/Sidebar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { CardContent, CardHeader, CardTitle, Card as ShadcnCard } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSocket } from "@/shared/hooks/useSocket";
import { useTheme } from "@/shared/hooks/useTheme";
import healthService from "@/shared/services/healthService";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import React, { useEffect, useState } from "react";
import {
    FiAlertCircle,
    FiArrowRight,
    FiInfo,
    FiTarget,
    FiZap
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { DashboardData } from "../types";

// --- SUB-COMPONENTS ---

const CircularProgress: React.FC<{ value: number; size?: number; strokeWidth?: number; color?: string; band?: string }> = ({ 
  value, 
  size = 120, 
  strokeWidth = 10, 
  color = "#22c55e",
  band = "Fair"
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-muted/50" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{band}</span>
      </div>
    </div>
  );
};

function CustomCard({ title, actions, children, className = "" }: { 
  title?: string; 
  actions?: React.ReactNode; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ShadcnCard className={className}>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5 space-y-0">
          {title && <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>}
          {actions && <div>{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={(!title && !actions) ? "p-5" : "px-5 pb-5 pt-3"}>
        {children}
      </CardContent>
    </ShadcnCard>
  );
}

const TrendingStockCard: React.FC<{ stock: any }> = ({ stock }) => {
  const { theme } = useTheme();
  const isPositive = stock.changePercent >= 0;
  
  const chartData = stock.sparkline?.map((price: number, idx: number) => ({
    name: idx,
    value: price,
  })) || [];

  return (
    <ShadcnCard className="transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 flex flex-col justify-between overflow-hidden group">
      <div className="p-5 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-border bg-muted/30 flex items-center justify-center p-2 shrink-0">
             {stock.logoUrl ? (
                <img src={stock.logoUrl} alt={stock.symbol} className="w-full h-full object-contain" />
             ) : (
                <div className="text-sm font-bold text-primary">{stock.symbol[0]}</div>
             )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight truncate">{stock.symbol}</div>
            <div className="text-[11px] text-muted-foreground font-medium truncate">{stock.companyName}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-tight">${stock.price.toFixed(2)}</div>
          <div className={`text-xs font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="h-20 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <Tooltip 
              content={({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover text-popover-foreground border px-3 py-2 rounded-lg shadow-lg text-sm">
                      <div className="text-muted-foreground text-xs mb-1">Price</div>
                      <div className="font-bold">${Number(payload[0].value).toFixed(2)}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
            <Area 
               type="monotone" 
               dataKey="value" 
               stroke={isPositive ? '#22c55e' : '#ef4444'} 
               fill={`url(#grad-${stock.symbol})`} 
               strokeWidth={2}
               isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ShadcnCard>
  );
};

// --- MAIN DASHBOARD ---

export const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [heatmapTimeframe, setHeatmapTimeframe] = useState<'1d' | '5d' | '1m'>('1d');
    const [showHealthBreakdown, setShowHealthBreakdown] = useState(false);
    const { getTradeMap } = useSocket(true);
    const tradeMap = getTradeMap();
    const { theme } = useTheme();

    const roles1 = user?.userRoles?.map((ur: any) => (ur?.role?.name || ur?.name || "").toUpperCase()) || [];
    const roles2 = user?.roles?.map((r: any) => (typeof r === "string" ? r : r?.name || "").toUpperCase()) || [];
    const userRoleList = [...roles1, ...roles2];
    
    const isAdmin = userRoleList.includes("ADMIN");
    const isPortfolioManager = userRoleList.includes("PORTFOLIO_MANAGER") || userRoleList.includes("PORTFOLIO MANAGER") || userRoleList.includes("PORTFOLIO");
    const isAnalyst = userRoleList.includes("ANALYST") || userRoleList.includes("ANALYST_ROLE") || userRoleList.includes("ANALYST ROLE");
    const isAdminOnly = isAdmin && !isPortfolioManager && !isAnalyst;
    const hidePortfolio = (isAnalyst || isAdmin) && !isPortfolioManager;

    useEffect(() => {
        if (isAdminOnly) {
            navigate("/access-control/users", { replace: true });
        }
    }, [isAdminOnly, navigate]);

    useEffect(() => {
        healthService.checkHealth();
      }, []);
    
    useEffect(() => {
        if (isAdminOnly) return; 
        const getDashboard = async () => {
            try {
                setIsLoading(true);
                const result = await fetchDashboardData();
                setData(result);
            } catch (err) {
                console.error("Dashboard Load Error:", err);
                setError("Failed to load dashboard data.");
            } finally {
                setIsLoading(false);
            }
        };
        getDashboard();
    }, []);

    if (isLoading || !data) {
        return (
            <div className="h-screen bg-background text-foreground flex overflow-hidden">
                <Sidebar />
                <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
                    <div className="max-w-[1400px] mx-auto space-y-8">
                        {/* Header Skeleton */}
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-8 w-72 rounded-lg" />
                            <div className="flex items-center gap-2">
                                <Skeleton className="w-2.5 h-2.5 rounded-full" />
                                <Skeleton className="h-4 w-52 rounded" />
                            </div>
                        </div>

                        {/* Trending Section Skeleton */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-6 w-24 rounded" />
                                <Skeleton className="h-6 w-16 rounded" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="p-5 rounded-xl border border-border bg-card space-y-4">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-2">
                                                <Skeleton className="h-6 w-16 rounded" />
                                                <Skeleton className="h-4 w-28 rounded" />
                                            </div>
                                            <Skeleton className="h-6 w-16 rounded-full" />
                                        </div>
                                        <div className="flex items-end justify-between pt-2">
                                            <Skeleton className="h-7 w-24 rounded" />
                                            <Skeleton className="h-8 w-24 rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Main Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Left Column (8 cols) */}
                            <section className="lg:col-span-8 md:space-y-8 space-y-6">
                                {/* Hero Card Skeleton */}
                                <div className="rounded-xl border border-border bg-card p-8 space-y-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex-1 space-y-3">
                                            <Skeleton className="h-5 w-24 rounded-full" />
                                            <Skeleton className="h-8 w-3/4 rounded-lg" />
                                            <Skeleton className="h-4 w-full rounded" />
                                            <Skeleton className="h-4 w-5/6 rounded" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 shrink-0">
                                            <div className="rounded-xl p-4 border border-border bg-muted/30 flex flex-col items-center gap-2 w-24">
                                                <Skeleton className="h-7 w-8 rounded" />
                                                <Skeleton className="h-3 w-14 rounded" />
                                            </div>
                                            <div className="rounded-xl p-4 border border-border bg-muted/30 flex flex-col items-center gap-2 w-24">
                                                <Skeleton className="h-7 w-8 rounded" />
                                                <Skeleton className="h-3 w-14 rounded" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-4 border-t border-border">
                                        <Skeleton className="h-6 w-36 rounded-full" />
                                        <Skeleton className="h-6 w-44 rounded-full" />
                                    </div>
                                </div>

                                {/* Heatmap Skeleton */}
                                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-6 w-48 rounded" />
                                        <div className="flex gap-1">
                                            <Skeleton className="h-7 w-10 rounded" />
                                            <Skeleton className="h-7 w-10 rounded" />
                                            <Skeleton className="h-7 w-10 rounded" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3 h-[240px]">
                                        {Array.from({ length: 12 }).map((_, i) => (
                                            <Skeleton key={i} className="h-full rounded-lg" />
                                        ))}
                                    </div>
                                </div>

                                {/* Priority Triggers Skeleton */}
                                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                                    <Skeleton className="h-6 w-36 rounded" />
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className="p-4 rounded-lg border border-border bg-card flex items-start gap-4">
                                                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex justify-between">
                                                        <Skeleton className="h-4 w-12 rounded" />
                                                        <Skeleton className="h-4 w-14 rounded-full" />
                                                    </div>
                                                    <Skeleton className="h-4 w-full rounded" />
                                                    <Skeleton className="h-3 w-3/4 rounded" />
                                                    <Skeleton className="h-4 w-20 rounded" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* Right Column (4 cols) */}
                            <aside className="lg:col-span-4 md:space-y-8 space-y-6">
                                {/* Portfolio Health Skeleton */}
                                <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-4 w-28 rounded" />
                                        <Skeleton className="w-6 h-6 rounded-full" />
                                    </div>
                                    <div className="flex flex-col items-center gap-3 py-4">
                                        <Skeleton className="w-32 h-32 rounded-full" />
                                        <Skeleton className="h-5 w-24 rounded" />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Skeleton className="h-3 w-20 rounded" />
                                            <Skeleton className="h-3 w-10 rounded" />
                                        </div>
                                        <Skeleton className="h-2 w-full rounded-full" />
                                    </div>
                                </div>

                                {/* Impact News Skeleton */}
                                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-5 w-32 rounded" />
                                        <Skeleton className="h-4 w-16 rounded" />
                                    </div>
                                    <div className="space-y-4 divide-y divide-border">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className={`space-y-2 ${i > 0 ? "pt-4" : ""}`}>
                                                <div className="flex items-center justify-between">
                                                    <Skeleton className="h-4 w-14 rounded-full" />
                                                    <Skeleton className="h-3 w-16 rounded" />
                                                </div>
                                                <Skeleton className="h-4 w-full rounded" />
                                                <Skeleton className="h-4 w-4/5 rounded" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const { briefing, portfolio, impactNews, smartTriggers, sectorHeatmap } = data;

    return (
        <div className="h-screen bg-background text-foreground flex overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
                <div className="max-w-[1400px] mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col gap-1">
                        <div className="text-2xl md:text-3xl font-bold tracking-tight">
                            {briefing.greeting || `Good afternoon, ${user?.displayName || 'Investor'}`}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Real-time Market Insights • {new Date(briefing.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>

                    {/* TRENDING SECTION */}
                    {data && data.trendingStocks && data.trendingStocks.length > 0 && (
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold tracking-tight">Trending</h2>
                                <Button variant="ghost" size="sm" onClick={() => navigate('/market')}>
                                    View all
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {data.trendingStocks.map(stock => (
                                    <TrendingStockCard key={stock.symbol} stock={stock} />
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* LEFT COLUMN: HERO BRIEFING & MAIN TOOLS */}
                        <section className="lg:col-span-8 md:space-y-8 space-y-6">
                            {/* DAILY BRIEFING HERO */}
                            <ShadcnCard className="bg-gradient-to-br from-cyan-600 to-blue-700 text-white border-0 overflow-hidden relative">
                                <CardContent className="p-8 relative z-10">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex-1">
                                            <Badge className="mb-4 bg-white/20 text-white border-white/20 hover:bg-white/30">
                                                Daily Pulse
                                            </Badge>
                                            <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
                                                {hidePortfolio ? "Market Overview & Insights" : briefing.portfolioAlert?.headline || "Your Daily Briefing"}
                                            </h1>
                                            <p className="text-white/70">
                                                {hidePortfolio ? "Review top-performing sectors, global heatmap activity, and priority market triggers below." : briefing.decisionSupport.headline}
                                            </p>
                                        </div>
                                        
                                        {!hidePortfolio && (
                                            <div className="grid grid-cols-2 gap-3 shrink-0">
                                                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                                                    <div className="text-2xl font-bold">{briefing.decisionSupport.summary?.buySignals}</div>
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Buy Signals</div>
                                                </div>
                                                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                                                    <div className="text-2xl font-bold">{briefing.decisionSupport.summary?.trimSignals}</div>
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Trim Needed</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {!hidePortfolio && briefing.portfolioAlert && (
                                        <div className="mt-8 flex flex-wrap gap-3 pt-6 border-t border-white/15">
                                            {briefing.portfolioAlert.overexposedSectors.map(sector => (
                                                <Badge key={sector} className="bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/30">
                                                    <FiZap className="mr-1 h-3 w-3" />
                                                    Overexposed: {sector}
                                                </Badge>
                                            ))}
                                            {briefing.portfolioAlert.stopLossBreaches > 0 && (
                                                <Badge className="bg-red-500 text-white border-0 hover:bg-red-600">
                                                    <FiAlertCircle className="mr-1 h-3 w-3" />
                                                    {briefing.portfolioAlert.stopLossBreaches} Stop Loss Breached
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                            </ShadcnCard>

                            {/* SECTOR HEATMAP */}
                            <CustomCard 
                                title="Global Sector Heatmap/Matrix" 
                                actions={
                                    <div className="flex bg-muted p-1 rounded-md">
                                        {['1d', '5d', '1m'].map((tf) => (
                                            <button
                                                key={tf}
                                                onClick={() => setHeatmapTimeframe(tf as any)}
                                                className={`px-3 py-1 rounded-sm text-xs transition-all ${
                                                    heatmapTimeframe === tf ? 'bg-background shadow-sm' : 'text-muted-foreground'
                                                }`}
                                            >
                                                {tf}
                                            </button>
                                        ))}
                                    </div>
                                }
                            >
                                <div className="h-[300px] w-full mt-2 overflow-x-auto">
                                    <div className="min-w-[600px] lg:min-w-[0px] h-full">
                                    <ResponsiveHeatMap
                                        data={[
                                            {
                                                id: "Growth",
                                                data: sectorHeatmap.sectors.slice(0, 4).map(s => ({ x: s.name.split(' ')[0], y: s.performance[heatmapTimeframe], full: s.name, exp: s.userExposurePct, syms: s.userSymbols }))
                                            },
                                            {
                                                id: "Industrial",
                                                data: sectorHeatmap.sectors.slice(4, 8).map(s => ({ x: s.name.split(' ')[0], y: s.performance[heatmapTimeframe], full: s.name, exp: s.userExposurePct, syms: s.userSymbols }))
                                            },
                                            {
                                                id: "Utility",
                                                data: sectorHeatmap.sectors.slice(8, 12).map(s => ({ x: s.name.split(' ')[0], y: s.performance[heatmapTimeframe], full: s.name, exp: s.userExposurePct, syms: s.userSymbols }))
                                            }
                                        ]}
                                        margin={{ top: 30, right: 30, bottom: 30, left: 80 }}
                                        valueFormat=">-.2f"
                                        axisTop={null}
                                        axisLeft={{
                                            tickSize: 5,
                                            tickPadding: 5,
                                            tickRotation: 0
                                        }}
                                        colors={(cell) => {
                                            const v = Number(cell.value);
                                            if (v > 1) return '#16a34a';
                                            if (v > 0) return '#15803d';
                                            if (v < -1) return '#dc2626';
                                            if (v < 0) return '#b91c1c';
                                            return '#52525b';
                                        }}
                                        emptyColor="#3f3f46"
                                        enableLabels={true}
                                        labelTextColor="#ffffff"
                                        borderRadius={4}
                                        borderWidth={2}
                                        borderColor="#18181b"
                                        theme={{
                                            axis: {
                                                ticks: { text: { fill: "#71717a", fontSize: 11, fontWeight: 500 } }
                                            },
                                            labels: { text: { fontSize: 12, fontWeight: 600 } },
                                        }}
                                        tooltip={( { cell } ) => (
                                            <div className="bg-background text-foreground text-sm p-3 rounded-md border shadow-md">
                                                <div className="font-semibold mb-1">{cell.data.full}</div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground mr-4">Performance</span>
                                                    <span className={Number(cell.value) >= 0 ? 'text-green-600' : 'text-red-600'}>{cell.value}%</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-muted-foreground mr-4">Exposure</span>
                                                    <span>{cell.data.exp}%</span>
                                                </div>
                                                {cell.data.syms?.length > 0 && <div className="mt-2 text-xs text-muted-foreground">Holdings: {cell.data.syms.join(', ')}</div>}
                                            </div>
                                        )}
                                    />
                                    </div>
                                </div>
                                <div className="mt-4 text-xs text-muted-foreground text-right">
                                    Last updated {Math.floor((new Date().getTime() - new Date(sectorHeatmap.cachedAt).getTime()) / 60000)}m ago
                                </div>
                            </CustomCard>

                            {/* SMART TRIGGERS */}
                            <CustomCard title="Priority Triggers" className="h-fit">
                                <div className="grid md:grid-cols-2 gap-4">
                                    {(smartTriggers?.items || []).slice(0, 4).map((trigger, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => navigate('/market')}
                                            className={`p-4 rounded-lg border transition-all cursor-pointer hover:bg-muted/50 ${trigger.urgency === 'HIGH' ? 'border-destructive/30 bg-destructive/5' : 'bg-card'}`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${trigger.urgency === 'HIGH' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}>
                                                    {trigger.type.includes('STOP') ? <FiTarget className="h-5 w-5" /> : <FiZap className="h-5 w-5" />}
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-semibold text-primary">{trigger.symbol}</span>
                                                        <Badge variant={trigger.urgency === 'HIGH' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0">
                                                            {trigger.urgency}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-sm font-medium leading-tight">{trigger.message}</div>
                                                    <p className="text-xs text-muted-foreground">{trigger.context}</p>
                                                    <div className="text-xs font-semibold text-primary flex items-center gap-1 mt-2">
                                                        {trigger.action} <FiArrowRight className="h-3 w-3" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CustomCard>
                        </section>

                        {/* RIGHT COLUMN: PORTFOLIO & NEWS */}
                        <aside className="lg:col-span-4 md:space-y-8 space-y-6">
                            {!hidePortfolio && (
                                <ShadcnCard className="relative overflow-hidden">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5 space-y-0">
                                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Portfolio Health</CardTitle>
                                        <Button 
                                           variant="ghost" 
                                           size="icon"
                                           onClick={() => setShowHealthBreakdown(!showHealthBreakdown)}
                                           className={`h-8 w-8 ${showHealthBreakdown ? 'text-primary' : 'text-muted-foreground'}`}
                                        >
                                           <FiInfo className="h-4 w-4" />
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="px-5 pb-5">

                                    {showHealthBreakdown && (
                                        <div className="absolute inset-x-0 top-16 mx-4 z-20 animate-in fade-in slide-in-from-top-4 duration-300">
                                            <div className="bg-popover text-popover-foreground border rounded-xl p-6 shadow-xl">
                                                <div className="flex items-center justify-between mb-4">
                                            <div className="text-xs font-bold uppercase tracking-wider text-primary">Health Breakdown</div>
                                                    <button onClick={() => setShowHealthBreakdown(false)} className="text-muted-foreground hover:text-foreground">&times;</button>
                                                </div>
                                                
                                                <div className="space-y-4">
                                                    {[
                                                        { label: "Diversification", value: portfolio.healthScore.breakdown.diversification },
                                                        { label: "Risk/Reward", value: portfolio.healthScore.breakdown.riskReward },
                                                        { label: "Volatility", value: portfolio.healthScore.breakdown.volatility },
                                                        { label: "Alert Health", value: portfolio.healthScore.breakdown.alertHealth },
                                                        { label: "Watchlist Discipline", value: portfolio.healthScore.breakdown.watchlistDiscipline }
                                                    ].map((item) => (
                                                        <div key={item.label}>
                                                            <div className="flex justify-between text-xs font-medium mb-1.5">
                                                                <span className="text-muted-foreground">{item.label}</span>
                                                                <span className={item.value > 70 ? 'text-green-600' : item.value > 40 ? 'text-yellow-600' : 'text-red-600'}>{item.value}%</span>
                                                            </div>
                                                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full transition-all duration-1000 ease-out rounded-full ${
                                                                        item.value > 70 ? 'bg-green-500' : item.value > 40 ? 'bg-yellow-500' : 'bg-red-500'
                                                                    }`}
                                                                    style={{ width: `${item.value}%` }} 
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col items-center">
                                        <CircularProgress 
                                            value={portfolio.healthScore.score} 
                                            band={portfolio.healthScore.band}
                                            color={portfolio.healthScore.score > 70 ? '#16a34a' : portfolio.healthScore.score > 40 ? '#eab308' : '#dc2626'}
                                        />
                                        <div className="text-center mt-4">
                                            <div className="text-sm font-medium text-muted-foreground">{portfolio.healthScore.label}</div>
                                        </div>
                                        <div className="w-full flex justify-between gap-6 mt-8 pt-6 border-t">
                                            <div className="min-w-fit">
                                                <div className="text-xs text-muted-foreground mb-1">Total Value</div>
                                                <div className="text-2xl font-bold tracking-tight">${portfolio.totalValue.toLocaleString()}</div>
                                            </div>
                                            <div className="text-right min-w-fit">
                                                <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
                                                <div className={`text-2xl font-bold tracking-tight ${portfolio.totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {portfolio.totalUnrealizedPnL >= 0 ? '+' : ''}${Math.abs(portfolio.totalUnrealizedPnL).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-full bg-muted p-4 rounded-lg mt-6 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-primary" />
                                                <span className="text-sm font-medium">Today's Performance</span>
                                            </div>
                                            <div className={`text-sm font-bold ${portfolio.todayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {portfolio.todayGainLoss >= 0 ? '+' : ''}{portfolio.todayGainLossPct}%
                                            </div>
                                        </div>

                                        <div className="w-full mt-6 space-y-2">
                                            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">MVP</Badge>
                                                    <div className="text-sm font-semibold">{portfolio.bestPerformer?.symbol || 'N/A'}</div>
                                                </div>
                                                <div className="text-sm font-bold text-green-500">+{portfolio.bestPerformer?.changePercent || 0}%</div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100">LVP</Badge>
                                                    <div className="text-sm font-semibold">{portfolio.worstPerformer?.symbol || 'N/A'}</div>
                                                </div>
                                                <div className="text-sm font-bold text-red-500">{portfolio.worstPerformer?.changePercent || 0}%</div>
                                            </div>
                                        </div>
                                    </div>
                                    </CardContent>
                                </ShadcnCard>
                            )}

                            {/* IMPACT NEWS */}
                            <CustomCard 
                                title="Impact News" 
                                actions={
                                    <Button variant="link" className="p-0 h-auto text-xs text-primary" onClick={() => navigate('/news')}>
                                        View all {impactNews.totalCount} <FiArrowRight className="ml-1 h-3 w-3" />
                                    </Button>
                                }
                            >
                                <div className="space-y-4">
                                    {(impactNews.items || []).slice(0, 5).map((news) => (
                                        <div key={news.id} className={`group p-4 rounded-lg border transition-all hover:bg-muted/50 ${news.impact === 'NEGATIVE_HOLDING' ? 'border-l-4 border-l-destructive bg-destructive/5' : 'bg-card'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-[10px] bg-background">{news.symbol}</Badge>
                                                    {news.sharesHeld > 0 && <span className="text-[10px] font-medium text-muted-foreground italic">Holding {news.sharesHeld}</span>}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground">{new Date(news.publishedAt).toLocaleDateString()}</span>
                                            </div>
                                            <a href={news.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold block hover:text-primary transition-colors mb-2 leading-tight">
                                                {news.headline}
                                            </a>
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <span>{news.source}</span>
                                                <span className={`font-medium ${news.sentiment === 'BULLISH' ? 'text-green-600' : news.sentiment === 'BEARISH' ? 'text-red-600' : ''}`}>{news.sentiment}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CustomCard>
                        </aside>
                    </div>
                </div>
            </main>
        </div>
    );
};