import { useAuth } from "@/modules/auth/hooks/useAuth";
import api from "@/shared/api/axios";
import { ConfirmationModal } from "@/shared/components/ConfirmationModal";
import { Sidebar } from "@/shared/components/Sidebar";
import { SmartSearch } from "@/shared/components/SmartSearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge as ShadcnBadge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton as ShadcnSkeleton } from "@/shared/components/ui/skeleton";
import { useSocket } from "@/shared/hooks/useSocket";
import { useTheme } from "@/shared/hooks/useTheme";
import { preloader } from "@/shared/utils/preloader";
import React, { useEffect, useState } from "react";
import {
    FiActivity,
    FiAlertCircle,
    FiBell,
    FiCheckCircle,
    FiDollarSign,
    FiEdit2,
    FiInfo,
    FiMessageSquare,
    FiPlus,
    FiTrash2,
    FiTrendingDown,
    FiTrendingUp,
    FiUpload
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import type { Alert, WatchlistItem } from "../types";

// --- Components ---

const Badge = ({ children, color = "cyan" }: { children: React.ReactNode, color?: string }) => {
  const colors: any = {
    cyan: "bg-primary/10 text-primary border-primary/20",
    red: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",
    green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10",
    yellow: "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10",
    gray: "bg-muted text-muted-foreground border-border hover:bg-muted",
  };
  return (
    <ShadcnBadge variant="outline" className={`px-2 py-0.5 text-[10px] font-bold ${colors[color]}`}>
      {children}
    </ShadcnBadge>
  );
};

const Skeleton = ({ className }: { className?: string }) => (
  <ShadcnSkeleton className={className} />
);

const formatNumber = (val: number | null, prefix = "", suffix = "") => {
  if (val === null || val === undefined) return "—";
  return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
};

const Watchlist: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isAnalyst = user?.userRoles?.some((ur: any) => ur.role?.name === "ANALYST");
  const { connected, subscribe, unsubscribe, getTradeMap } = useSocket(true);
  const tradeMap = getTradeMap();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [expandedBasis, setExpandedBasis] = useState<string | null>(null);
  
  // Alert management state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [currentAlerts, setCurrentAlerts] = useState<Alert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [newAlertType, setNewAlertType] = useState("PRICE_ABOVE");
  
  // Confirmation states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [symbolToRemove, setSymbolToRemove] = useState<string | null>(null);

  const [showAlertDeleteModal, setShowAlertDeleteModal] = useState(false);
  const [alertToDelete, setAlertToDelete] = useState<{ symbol: string, id: string } | null>(null);
  
  // Edit entry state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);

  const [newTickerSymbol, setNewTickerSymbol] = useState("");

  useEffect(() => {
    fetchWatchlist();
  }, []);

  useEffect(() => {
    if (connected && watchlist.length > 0) {
      watchlist.forEach(item => {
        subscribe(item.symbol);
      });
      return () => {
        watchlist.forEach(item => {
          unsubscribe(item.symbol);
        });
      };
    }
  }, [connected, watchlist, subscribe, unsubscribe]);

  const fetchWatchlist = async () => {
    try {
      setLoading(watchlist.length === 0);
      const res = await preloader.get<{ success: boolean; data: WatchlistItem[] }>("/api/v1/watchlist");
      if (res?.success && Array.isArray(res.data)) {
        setWatchlist(res.data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch watchlist");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (symbol: string) => {
    setSymbolToRemove(symbol);
    setShowRemoveModal(true);
  };

  const executeRemove = async () => {
    if (!symbolToRemove) return;
    const symbol = symbolToRemove;
    const previousWatchlist = [...watchlist];

    // Optimistic removal
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    setShowRemoveModal(false);
    setSymbolToRemove(null);

    try {
      await api.delete(`/api/v1/watchlist/${symbol}`);
      preloader.invalidate('/api/v1/watchlist');
      toast.success(`${symbol} removed`);
      unsubscribe(symbol);
    } catch (err: any) {
      // Rollback on error
      setWatchlist(previousWatchlist);
      toast.error("Failed to remove item");
    }
  };

  const handleConvertToPosition = async (symbol: string) => {
    setConfirmTarget(symbol);
    setShowConfirmModal(true);
  };
 
  const executeConversion = async () => {
    if (!confirmTarget) return;
    const symbol = confirmTarget;
    const previousWatchlist = [...watchlist];
 
    // Optimistic removal
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    setConfirmTarget(null);

    try {
      await api.post(`/api/v1/watchlist/${symbol}/convert-to-position`, {});
      toast.success(`${symbol} successfully converted to portfolio position`);
      preloader.invalidate('/api/v1/watchlist');
      unsubscribe(symbol);
      // Refetch entire watchlist for metrics updates
      fetchWatchlist();
    } catch (err: any) {
      setWatchlist(previousWatchlist);
      toast.error(err.response?.data?.message || "Conversion failed");
    }
  };
 
  const handleUpdateEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    
    const formData = new FormData(e.currentTarget);
    const data = {
      targetEntryPrice: parseFloat(formData.get("targetEntryPrice") as string),
      stopLoss: parseFloat(formData.get("stopLoss") as string),
      notes: formData.get("notes") as string,
    };
 
    if (data.stopLoss >= data.targetEntryPrice) {
      toast.error("Stop-loss must be lower than target entry price");
      return;
    }

    try {
      await api.patch(`/api/v1/watchlist/${editingItem.symbol}`, data);
      preloader.invalidate('/api/v1/watchlist');
      toast.success(`Updated ${editingItem.symbol}`);
      setShowEditModal(false);
      fetchWatchlist();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Update failed");
    }
  };

  const openAlerts = async (symbol: string) => {
    setSelectedItem(watchlist.find(i => i.symbol === symbol) || null);
    setShowAlertModal(true);
    setLoadingAlerts(true);
    try {
      const res = await preloader.get<{ success: boolean; data: Alert[] }>(`/api/v1/watchlist/${symbol}/alerts`);
      if (res?.success) {
        setCurrentAlerts(res.data);
      }
    } catch (err) {
      toast.error("Failed to fetch alerts");
    } finally {
      setLoadingAlerts(false);
    }
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Market Watchlist
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Monitor high-conviction setups and AI insights.</p>
          </div>
          <Button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2"
          >
            <FiPlus /> Add Ticker
          </Button>
        </div>

        {/* Watchlist Table/Cards */}
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-sm">
                <div className="flex flex-col lg:grid lg:grid-cols-[1.2fr_1fr_4.5fr_1fr] gap-4 md:gap-6">
                  {/* Column 1: Symbol & Price */}
                  <div className="flex items-start gap-4">
                    <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-20 rounded" />
                        <Skeleton className="h-4 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-7 w-28 rounded-md" />
                      <Skeleton className="h-4 w-36 rounded" />
                    </div>
                  </div>

                  {/* Column 2: Portfolio Fit */}
                  <div className="flex flex-col justify-center border-t lg:border-t-0 lg:border-l-2 pt-4 lg:pt-0 lg:pl-8 border-border space-y-2">
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>

                  {/* Column 3: Strategy & AI Targets */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 border-t lg:border-t-0 lg:border-l-2 pt-4 lg:pt-0 lg:pl-6 border-border">
                    <div className="space-y-3">
                      <Skeleton className="h-3 w-24 rounded" />
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-12 rounded" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <Skeleton className="w-1.5 h-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-14 rounded" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Skeleton className="h-3 w-24 rounded" />
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-12 rounded" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <Skeleton className="w-1.5 h-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-14 rounded" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 4: Actions */}
                  <div className="flex flex-row lg:flex-col justify-center border-t lg:border-t-0 lg:border-l-2 pt-4 lg:pt-0 lg:pl-10 gap-2 border-border">
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <div className="flex gap-2 justify-end lg:justify-center">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : watchlist.length === 0 ? (
            <div className="text-center py-20 bg-card border border-dashed border-border rounded-lg">
              <FiActivity className="text-5xl text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Your watchlist is empty. Add a symbol to get started.</p>
            </div>
          ) : (
            watchlist.map((item) => (
              <div 
                key={item.symbol} 
                className={`group border transition-all duration-300 rounded-lg p-4 md:p-6 bg-card ${
                  item.stopLossBreached 
                    ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]" 
                    : "border-border hover:border-border/80 hover:shadow-lg hover:shadow-primary/5"
                }`}
              >
                <div className="flex flex-col lg:grid lg:grid-cols-[1.2fr_1fr_4.5fr_1fr] gap-4 md:gap-6">
                  
                  {/* Symbol & Market Data */}
                  <div className="flex items-start gap-4">
                    <Avatar className="w-12 h-12 border border-border">
                      {item.logo && <AvatarImage src={item.logo} alt={item.symbol} className="object-cover" />}
                      <AvatarFallback className="text-xl font-bold bg-muted text-foreground">
                        {item.symbol[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-foreground">{item.symbol}</span>
                        {item.entryZone && <Badge color="green">ENTRY ZONE</Badge>}
                        {item.stopLossBreached && <Badge color="red">SL BREACHED</Badge>}
                        {connected && tradeMap.has(item.symbol.toUpperCase()) && (
                          <div className="flex items-center gap-1.5 ml-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-cyan-500">LIVE</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col mt-1">
                        <span className="text-2xl font-semibold">
                          {formatNumber(tradeMap.get(item.symbol.toUpperCase())?.p ?? item.currentPrice, "$")}
                        </span>
                        <div className="flex items-center gap-2 text-sm">
                          <span className={item.changePercent && item.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}>
                            {item.changePercent && item.changePercent >= 0 ? <FiTrendingUp className="inline mr-1" /> : <FiTrendingDown className="inline mr-1" />}
                            {formatNumber(item.changePercent, "", "%")}
                          </span>
                          <span className="text-muted-foreground">|</span>
                          <span className={`flex items-center gap-1 ${item.priceSinceAdded && item.priceSinceAdded >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {item.priceSinceAdded && item.priceSinceAdded >= 0 ? "+" : ""}
                            {formatNumber(item.priceSinceAdded, "", "%")} (Added)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portfolio Fit & Exposure */}
                  <div className={`flex flex-col justify-center border-t lg:border-t-0 lg:border-l-2 pt-4 lg:pt-0 lg:pl-8 border-border`}>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Portfolio Fit</div>
                    {item.portfolioFit ? (
                      <div className={`text-sm font-medium p-3 rounded-lg flex gap-3 transition-colors duration-300 ${item.portfolioFit.overexposureWarning ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-cyan-500/5 text-cyan-600 border border-cyan-500/10"}`}>
                        {item.portfolioFit.overexposureWarning ? <FiAlertCircle className="shrink-0 mt-0.5" /> : <FiCheckCircle className="shrink-0 mt-0.5" />}
                        <span>{item.portfolioFit.message}</span>
                      </div>
                    ) : (
                      <Link to="/decision-support/portfolio-health" className="text-[10px] text-cyan-500 hover:text-cyan-400 font-bold underline flex items-center gap-1">
                         <FiUpload className="text-xs" /> Upload Portfolio for Analysis
                      </Link>
                    )}
                  </div>                    {/* Strategy Column: User Plan & AI Analysis */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 border-t lg:border-t-0 lg:border-l-2 pt-6 lg:pt-0 lg:pl-6 border-border`}>
                      
                      {/* USER STRATEGY - Stable 2-column grid */}
                      <div className="space-y-3 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-widest font-black whitespace-nowrap">
                          <span className="text-cyan-500">+</span> MY STRATEGY
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-bold mb-1 opacity-80 whitespace-nowrap">Targets</p>
                            <div className="flex flex-col gap-1">
                              {item.targetEntryPrice ? (
                                <p className="text-sm font-bold leading-snug">{formatNumber(item.targetEntryPrice, "$")}</p>
                              ) : (
                                <p className="text-sm font-black text-gray-800 leading-snug">—</p>
                              )}
                              {item.alerts?.filter(a => a.type === 'PRICE_ABOVE' && a.isActive && a.threshold !== item.targetEntryPrice).map(alert => (
                                <p key={alert.id} className="text-[10px] font-bold text-muted-foreground leading-tight">{formatNumber(alert.threshold, "$")}</p>
                              ))}
                            </div>
                          </div>
                          
                          <div className={`w-1.5 h-8 shrink-0 rounded-full ${theme === 'dark' ? 'bg-white/40' : 'bg-gray-500'}`} />
                          
                          <div className="flex-1">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1 opacity-80 whitespace-nowrap">Stop Loss</p>
                            <div className="flex flex-col gap-1">
                              {item.stopLoss ? (
                                <p className="text-sm font-black leading-snug text-red-500/90">{formatNumber(item.stopLoss, "$")}</p>
                              ) : (
                                <p className="text-sm font-bold text-muted-foreground leading-snug">—</p>
                              )}
                              {item.alerts?.filter(a => a.type === 'PRICE_BELOW' && a.isActive && a.threshold !== item.stopLoss).map(alert => (
                                <p key={alert.id} className="text-[10px] font-bold text-red-500/50 leading-tight">{formatNumber(alert.threshold, "$")}</p>
                              ))}
                            </div>
                          </div>
                        </div>

                        {item.notes && (
                          <div className="flex gap-2 items-start pt-1.5 border-t border-white/5 opacity-60">
                            <FiMessageSquare className="shrink-0 mt-0.5 text-gray-500 text-[9px]" />
                            <p className="text-[10px] text-gray-500 italic leading-snug line-clamp-1">{item.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* AI STRATEGY - Stable 2-column grid */}
                      <div className={`space-y-3 min-w-0 border-t md:border-t-0 md:border-l-2 pt-6 md:pt-0 md:pl-6 border-border`}>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest font-bold whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/80"></span> 
                          AI Suggested
                        </div>

                        <div className="space-y-4">
                          {/* Top Row Grid */}
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1 opacity-80 whitespace-nowrap">Entry</p>
                              <p className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>{formatNumber(item.aiSuggested?.entry ?? null, "$")}</p>
                            </div>
                            
                            <div className={`w-1.5 h-8 shrink-0 rounded-full ${theme === 'dark' ? 'bg-white/40' : 'bg-gray-500'}`} />
                            
                            <div className="flex-1">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1 opacity-80 whitespace-nowrap">Exit (TP)</p>
                              <p className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>{formatNumber(item.aiSuggested?.takeProfit ?? null, "$")}</p>
                            </div>
                          </div>

                          {/* Bottom Row Grid: Risk & Confidence */}
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1 opacity-80 whitespace-nowrap">Risk (SL)</p>
                              <p className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`}>{formatNumber(item.aiSuggested?.stopLoss ?? null, "$")}</p>
                            </div>
                            <div className="pt-2">
                              {item.aiSuggested && (
                                <span className={`px-1.5 py-0.5 rounded bg-white/5 text-[8px] font-black border ${
                                  item.aiSuggested.confidence === 'HIGH' ? 'text-emerald-400 border-emerald-400/20' : 
                                  item.aiSuggested.confidence === 'MEDIUM' ? 'text-amber-400 border border-amber-400/20' : 'text-red-400 border border-red-400/20'
                                }`}>
                                  {item.aiSuggested.confidence}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Row: Basis Button */}
                          {item.aiSuggested ? (
                            <div className="pt-1">
                              <button 
                                onClick={() => setExpandedBasis(expandedBasis === item.symbol ? null : item.symbol)} 
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-all group shadow-sm active:scale-95"
                              >
                                <FiInfo size={14} className="text-cyan-500 group-hover:scale-110 transition-transform shrink-0" />
                                <span className="text-[11px] font-black text-cyan-500 uppercase tracking-widest whitespace-nowrap">Basis Analysis</span>
                              </button>
                            </div>
                          ) : (
                            <div className="pt-1">
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Awaiting Analysis</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>


                   {/* Actions */}
                  <div className="flex flex-row lg:flex-col justify-between items-center lg:items-stretch py-2 border-t lg:border-t-0 lg:border-l-2 pt-4 lg:pt-0 lg:pl-10 gap-4 border-border">
                    <div className="flex flex-col gap-2">
                      {!isAnalyst && (
                        <button 
                          onClick={() => handleConvertToPosition(item.symbol)}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition lg:whitespace-nowrap"
                        >
                          <FiDollarSign /> Buy Now
                        </button>
                      )}
                      <button 
                        onClick={() => openAlerts(item.symbol)}
                        onMouseEnter={() => preloader.preload(`/api/v1/watchlist/${item.symbol}/alerts`)}
                        onFocus={() => preloader.preload(`/api/v1/watchlist/${item.symbol}/alerts`)}
                        className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition border bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                      >
                        <FiBell /> Alerts
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button 
                        onClick={() => {
                          setEditingItem(item);
                          setShowEditModal(true);
                        }}
                        className="p-2 rounded-lg transition bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleRemove(item.symbol)}
                        className="p-2 rounded-lg transition bg-destructive/10 text-destructive hover:bg-destructive/20"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded AI Basis */}
                {expandedBasis === item.symbol && item.aiSuggested && (
                  <div className="mt-6 p-6 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex gap-5">
                      <div className="p-3 bg-primary/10 rounded-xl h-fit text-primary">
                        <FiInfo size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold tracking-wider uppercase">AI Logic Basis</p>
                          <span className="text-[10px] text-primary/60 font-bold tracking-widest bg-primary/5 px-2 py-1 rounded">LIVE ANALYSIS</span>
                        </div>
                        <p className="text-sm leading-relaxed max-w-4xl font-medium text-muted-foreground">
                          {item.aiSuggested.basis}
                        </p>
                        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                            Intelligence Protocol v4.0 • Updated: {new Date(item.aiSuggested.computedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Edit Ticker Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="border rounded-lg w-full max-w-md shadow-2xl p-6 bg-card border-border">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <FiEdit2 className="text-primary" />
              Edit {editingItem.symbol}
            </h2>
            <form onSubmit={handleUpdateEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Target Entry Price</label>
                  <input name="targetEntryPrice" type="number" step="0.01" defaultValue={editingItem.targetEntryPrice || ''} required className="w-full h-12 border rounded-lg px-4 focus:border-primary/50 outline-none transition bg-secondary border-border" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Stop Loss</label>
                  <input name="stopLoss" type="number" step="0.01" defaultValue={editingItem.stopLoss || ''} required className="w-full h-12 border rounded-lg px-4 focus:border-primary/50 outline-none transition text-red-400 bg-secondary border-border" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (Optional)</label>
                <textarea name="notes" defaultValue={editingItem.notes || ''} placeholder="Update your strategy notes..." className="w-full h-24 border rounded-lg px-4 py-3 focus:border-primary/50 outline-none transition resize-none bg-secondary border-border" />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 h-12 rounded-lg font-bold transition bg-secondary text-muted-foreground hover:bg-secondary/80">Cancel</button>
                <button type="submit" className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ticker Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="border rounded-lg w-full max-w-md shadow-2xl p-6 bg-card border-border">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <FiPlus className="text-primary" />
              Add New Ticker
            </h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const rawData = Object.fromEntries(formData) as any;
              const data = {
                ...rawData,
                symbol: newTickerSymbol,
                targetEntryPrice: parseFloat(rawData.targetEntryPrice),
                stopLoss: parseFloat(rawData.stopLoss),
              };

              if (!data.symbol) {
                toast.error("Please select a ticker symbol");
                return;
              }

              if (data.stopLoss >= data.targetEntryPrice) {
                toast.error("Stop-loss must be lower than target entry price");
                return;
              }

              try {
                await api.post("/api/v1/watchlist", data);
                toast.success(`${data.symbol} added to watchlist`);
                setShowAddModal(false);
                setNewTickerSymbol("");
                fetchWatchlist();
              } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to add symbol");
              }
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Ticker Symbol</label>
                <SmartSearch 
                  onSubmit={(sym) => setNewTickerSymbol(sym)}
                  placeholder="Search symbol (e.g. NVDA)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Target Entry Price</label>
                  <input name="targetEntryPrice" type="number" step="0.01" required placeholder="150" className="w-full h-12 border rounded-lg px-4 focus:border-primary/50 outline-none transition bg-secondary border-border" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Stop Loss</label>
                  <input name="stopLoss" type="number" step="0.01" required placeholder="140" className="w-full h-12 border rounded-lg px-4 focus:border-primary/50 outline-none transition text-red-400 bg-secondary border-border" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (Optional)</label>
                <textarea name="notes" placeholder="e.g. Buy near EMA support" className="w-full h-24 border rounded-lg px-4 py-3 focus:border-primary/50 outline-none transition resize-none bg-secondary border-border" />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => { setShowAddModal(false); setNewTickerSymbol(""); }} className="flex-1 h-12 rounded-lg font-bold transition bg-secondary text-muted-foreground hover:bg-secondary/80">Cancel</button>
                <button type="submit" className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition">Add Symbol</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alerts Modal */}
      {showAlertModal && selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FiBell className="text-primary" />
                Alerts for {selectedItem.symbol}
              </h2>
              <button 
                onClick={() => setShowAlertModal(false)}
                className="p-2 hover:bg-secondary rounded-lg text-muted-foreground"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4 max-h-[400px] overflow-y-auto mb-6 pr-2 custom-scrollbar">
              {loadingAlerts ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : currentAlerts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground bg-secondary/30 rounded-lg border border-dashed border-border">
                  <FiAlertCircle className="mx-auto text-3xl mb-2 opacity-20" />
                  No active alerts
                </div>
              ) : (
                currentAlerts.map(alert => (
                  <div key={alert.id} className="bg-secondary/50 p-4 rounded-lg flex items-center justify-between border border-border hover:border-primary/30 transition">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${alert.type === 'PRICE_ABOVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-500'}`}>
                        {alert.type === 'PRICE_ABOVE' ? <FiTrendingUp /> : <FiTrendingDown />}
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none block mb-1">
                          {alert.type.split('_').join(' ')}
                        </span>
                        <p className="font-mono font-bold text-lg leading-none">{formatNumber(alert.threshold, "$")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={async () => {
                          if (!selectedItem) return;
                          const nextState = !alert.isActive;
                          // Optimistic update
                          setCurrentAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, isActive: nextState } : a));
                          try {
                            await api.patch(`/api/v1/watchlist/${selectedItem.symbol}/alerts/${alert.id}`, { isActive: nextState });
                            preloader.invalidate(`/api/v1/watchlist/${selectedItem.symbol}/alerts`);
                            fetchWatchlist();
                          } catch (err) { 
                            // Rollback
                            setCurrentAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, isActive: !nextState } : a));
                            toast.error("Update failed"); 
                          }
                        }}
                        className={`w-10 h-5 rounded-full transition-colors relative ${alert.isActive ? 'bg-cyan-500' : 'bg-gray-700'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${alert.isActive ? 'left-6' : 'left-1'}`} />
                      </button>
                      <button 
                        onClick={async () => {
                          setAlertToDelete({ symbol: selectedItem.symbol, id: alert.id });
                          setShowAlertDeleteModal(true);
                        }}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-[11px] text-blue-400">
                <FiInfo className="shrink-0" />
                <span>Note: Alerts have a 1-hour cooldown after triggering to prevent spam.</span>
              </div>
              
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Create New Alert</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = {
                   symbol: selectedItem.symbol,
                   type: newAlertType,
                   threshold: formData.get('threshold') ? parseFloat(formData.get('threshold') as string) : null
                };
                try {
                  await api.post(`/api/v1/watchlist/${selectedItem.symbol}/alerts`, data);
                  preloader.invalidate(`/api/v1/watchlist/${selectedItem.symbol}/alerts`);
                  toast.success("Alert set");
                  openAlerts(selectedItem.symbol);
                  fetchWatchlist();
                } catch (err) { toast.error("Failed to set alert"); }
              }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                      <select 
                    name="type" 
                    value={newAlertType}
                    onChange={(e) => setNewAlertType(e.target.value)}
                    className={`border rounded-xl px-4 h-12 outline-none text-sm focus:border-cyan-500/50 appearance-none cursor-pointer font-medium ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  >
                     <option value="PRICE_ABOVE" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>Price Above</option>
                     <option value="PRICE_BELOW" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>Price Below</option>
                     <option value="PCT_CHANGE_UP" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>% Change Up</option>
                     <option value="PCT_CHANGE_DOWN" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>% Change Down</option>
                     <option value="ENTRY_ZONE" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>Entry Zone Hit</option>
                     <option value="SL_BREACHED" className={theme === 'dark' ? "bg-zinc-900 text-white" : "bg-white text-black"}>Stop Loss Hit</option>
                  </select>
                  
                  {["PRICE_ABOVE", "PRICE_BELOW", "PCT_CHANGE_UP", "PCT_CHANGE_DOWN"].includes(newAlertType) ? (
                    <input 
                      name="threshold" 
                      type="number" 
                      step="0.01" 
                      required 
                      placeholder={newAlertType.includes('PCT') ? "e.g. 5 (%)" : "Target Price"} 
                      className="bg-white/5 border border-white/10 rounded-xl px-4 h-12 outline-none text-sm focus:border-cyan-500/50" 
                    />
                  ) : (
                    <div className="bg-white/5 border border-white/5 rounded-xl px-4 h-12 flex items-center text-xs text-gray-500 italic">
                      No threshold needed
                    </div>
                  )}
                </div>
                
                <button type="submit" className="w-full h-12 rounded-xl bg-cyan-500 text-black font-bold flex items-center justify-center gap-2 hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20">
                  <FiPlus /> Set Alert
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal for Conversion */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={executeConversion}
        onCancel={() => setShowConfirmModal(false)}
        title="Convert to Portfolio?"
        message={`Are you sure you want to convert ${confirmTarget} to a live portfolio position? This action is NOT reversible and will move the ticker from your watchlist to your active holdings.`}
        confirmText="Yes, Convert Now"
        cancelText="Maybe Later"
        variant="success"
      />

      <ConfirmationModal
        isOpen={showRemoveModal}
        onConfirm={executeRemove}
        onCancel={() => setShowRemoveModal(false)}
        title="Remove from Watchlist?"
        message={`Are you sure you want to remove ${symbolToRemove} from your watchlist? You will no longer receive price alerts or AI updates for this ticker.`}
        confirmText="Remove Now"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showAlertDeleteModal}
        onConfirm={async () => {
          if (!alertToDelete) return;
          const target = alertToDelete;
          const previousAlerts = [...currentAlerts];

          // Optimistic removal from modal list
          setCurrentAlerts(prev => prev.filter(a => a.id !== target.id));
          setShowAlertDeleteModal(false);
          setAlertToDelete(null);

          try {
            await api.delete(`/api/v1/watchlist/${target.symbol}/alerts/${target.id}`);
            preloader.invalidate(`/api/v1/watchlist/${target.symbol}/alerts`);
            fetchWatchlist();
            toast.success("Alert deleted");
          } catch (err) { 
            setCurrentAlerts(previousAlerts);
            toast.error("Delete failed"); 
          }
        }}
        onCancel={() => setShowAlertDeleteModal(false)}
        title="Delete Alert?"
        message="Are you sure you want to delete this price alert? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default Watchlist;
