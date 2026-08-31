import { useEffect, useMemo, useState } from "react";
import React from "react";
import { FiAlertCircle, FiPlus, FiTrendingDown, FiTrendingUp as FiUp } from "react-icons/fi";

import { SmartSearch } from "@/shared/components/SmartSearch";
import { Sidebar } from "@/shared/components/Sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import api from "@/shared/api/axios";
import { useSocket } from "@/shared/hooks/useSocket";
import { useTheme } from "@/shared/hooks/useTheme";
import type { StockData, Trade } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_SYMBOLS = ["BINANCE:BTCUSDT", "AAPL", "TSLA"];

const fmtPrice = (v: number) =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: v < 100 ? 2 : 0,
    maximumFractionDigits: v < 100 ? 4 : 0,
  })}`;

const fmtTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleTimeString();

// ─── LiveStockTable ───────────────────────────────────────────────────────────

export const LiveStockTable: React.FC<{ hideHeader?: boolean }> = ({ hideHeader = false }) => {
  const {
    connected,
    error,
    subscribe,
    unsubscribe,
    getTradeMap,
    tradeStats,
    lastUpdate,
    status,
  } = useSocket(true);
  const { theme } = useTheme();

  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [input, setInput] = useState("");
  // Track which symbols we've already subscribed so we don't re-sub on re-render
  const subscribedRef = React.useRef<Set<string>>(new Set());

  // On connect (or reconnect), re-subscribe to all tracked symbols
  React.useEffect(() => {
    if (!connected) return;
    symbols.forEach(s => {
      if (!subscribedRef.current.has(s)) {
        subscribe(s);
        subscribedRef.current.add(s);
      }
    });
  }, [connected]); // intentionally omit symbols — handled by the effect below

  // When a new symbol is added while already connected, subscribe it immediately
  React.useEffect(() => {
    if (!connected) return;
    symbols.forEach(s => {
      if (!subscribedRef.current.has(s)) {
        subscribe(s);
        subscribedRef.current.add(s);
      }
    });
  }, [symbols]); // intentionally omit connected — handled by the effect above

  const tradeMap = getTradeMap();

  const rows: Trade[] = useMemo(() => {
    return symbols.map((s) => {
      const t = tradeMap.get(s.toUpperCase());
      if (t) {
        return { ...t, updateCount: tradeStats.get(s.toUpperCase()) || 0 };
      }
      return { s, p: NaN, v: 0, snapshot: false, updateCount: 0 };
    });
  }, [symbols, tradeMap, tradeStats]);

  const handleAdd = () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (!symbols.includes(sym)) setSymbols((prev) => [...prev, sym]);
    subscribe(sym);
    setInput("");
  };

  const handleRemove = (sym: string) => {
    unsubscribe(sym);
    subscribedRef.current.delete(sym.toUpperCase());
    setSymbols((prev) => prev.filter((x) => x !== sym));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="rounded-lg overflow-hidden">
      {!hideHeader && (
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">Live Stock Data</h3>
            <p className="text-sm text-muted-foreground mt-1">Real-time market streaming</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary font-medium">
              {connected ? "Connected" : "Connecting..."}
            </span>
          </div>
        </div>
      )}

      {!hideHeader && (
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <SmartSearch
                onSubmit={(sym) => {
                  const newSymbols = sym.includes(",")
                    ? sym.split(",").map(s => s.trim().toUpperCase())
                    : [sym.toUpperCase()];
                  newSymbols.forEach(s => {
                    if (s && !symbols.includes(s)) {
                      setSymbols(prev => [...prev, s]);
                      subscribe(s);
                    }
                  });
                  setInput("");
                }}
                placeholder="Add symbol (e.g., AAPL, TSLA)"
                initialValue={input}
              />
            </div>
            <button
              onClick={handleAdd}
              className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <FiPlus /> Subscribe
            </button>
          </div>

          {error && (
            <div className="mt-3 flex gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <FiAlertCircle className="text-destructive mt-0.5" />
              <div>
                <div className="text-sm font-medium text-destructive">Connection Error</div>
                <div className="text-sm text-destructive/80 mt-1">{error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Symbol", "Price", "Volume", "Last Time", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.s}
                className={`border-b border-border transition-colors ${index % 2 === 0 ? "bg-muted/20 hover:bg-muted/40" : "hover:bg-muted/30"}`}
              >
                <td className="py-3.5 px-6 font-semibold">{row.s}</td>
                <td className="py-3.5 px-6 font-bold">
                  {Number.isFinite(row.p) ? `$${row.p.toFixed(2)}` : "—"}
                </td>
                <td className="py-3.5 px-6 text-muted-foreground">
                  {row.v ? row.v.toLocaleString() : "—"}
                </td>
                {!hideHeader && (
                  <td className="py-3.5 px-6 text-muted-foreground text-xs">
                    {row.t ? new Date(row.t).toLocaleTimeString() : "—"}
                  </td>
                )}
                <td className="py-3.5 px-6">
                  {status().subscribed.includes(row.s.toUpperCase()) ? (
                    <span className="text-green-500 font-medium flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Streaming
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Paused
                    </span>
                  )}
                </td>
                {!hideHeader && (
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => subscribe(row.s)}
                        disabled={status().subscribed.includes(row.s.toUpperCase())}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          status().subscribed.includes(row.s.toUpperCase())
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        Subscribe
                      </button>
                      <button
                        onClick={() => unsubscribe(row.s)}
                        disabled={!status().subscribed.includes(row.s.toUpperCase())}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          !status().subscribed.includes(row.s.toUpperCase())
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                        }`}
                      >
                        Unsubscribe
                      </button>
                      <button
                        onClick={() => handleRemove(row.s)}
                        className="px-3 py-1.5 text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!hideHeader && (
        <div className="p-5 border-t border-border">
          <div className="text-sm text-muted-foreground">
            Showing {rows.length} symbols • Last updated:{" "}
            {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"}
          </div>
          {!connected && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Skeleton className="w-5 h-5 rounded-full" />
              Connecting...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Markets Page ─────────────────────────────────────────────────────────────

const Markets = () => {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStocks = async () => {
    try {
      const res = await api.get("/api/v1/market/top-stocks");
      if (res.data?.success) setStocks(res.data.data);
    } catch (err) {
      console.error("Error fetching stocks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
    const interval = setInterval(fetchStocks, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:px-10 md:py-10 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto space-y-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Markets</h1>
              <p className="text-sm text-muted-foreground">Real-time &amp; snapshot US stock market data</p>
            </div>
          </div>

          <Card className="overflow-hidden">
            <LiveStockTable />
          </Card>

          <h2 className="text-lg font-bold tracking-tight">Most Active Stocks</h2>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    {["Rank","Symbol","Name","Price","Change %","Open","High","Low","Prev Close","Time"].map((h) => (
                      <TableHead key={h} className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`sk-${i}`} className="border-border">
                          <TableCell className="py-3.5 px-6"><Skeleton className="h-4 w-6" /></TableCell>
                          <TableCell className="py-3.5 px-6">
                            <div className="flex items-center gap-2">
                              <Skeleton className="w-7 h-7 rounded-full" />
                              <Skeleton className="h-4 w-12" />
                            </div>
                          </TableCell>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j} className="py-3.5 px-6 text-right">
                              <Skeleton className="h-4 w-16 ml-auto" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : stocks.map((r, index) => (
                        <TableRow
                          key={r.symbol}
                          className={`border-border transition-colors whitespace-nowrap ${
                            index % 2 === 0 ? "bg-muted/20 hover:bg-muted/40" : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="py-3.5 px-6 text-muted-foreground font-semibold">{index + 1}</TableCell>
                          <TableCell className="py-3.5 px-6 font-bold">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="w-7 h-7 bg-muted/50 shrink-0">
                                <AvatarImage src={r.logoUrl} alt={r.symbol} />
                                <AvatarFallback className="text-[10px] font-bold">{r.symbol.slice(0, 2)}</AvatarFallback>
                              </Avatar>
                              <span className="font-bold tracking-wide">{r.symbol}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 px-6 truncate max-w-[200px] text-muted-foreground font-medium">{r.companyName}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right font-bold">{fmtPrice(r.price)}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right">
                            <div className={`flex items-center justify-end gap-1 font-bold ${r.changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {r.changePercent >= 0 ? <FiUp /> : <FiTrendingDown />}
                              {r.changePercent.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 px-6 text-right text-muted-foreground">{fmtPrice(r.open)}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right text-muted-foreground">{fmtPrice(r.high)}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right text-muted-foreground">{fmtPrice(r.low)}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right text-muted-foreground">{fmtPrice(r.previousClose)}</TableCell>
                          <TableCell className="py-3.5 px-6 text-right text-muted-foreground text-xs">{fmtTime(r.timestamp)}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Markets;
