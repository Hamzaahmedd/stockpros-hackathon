import { SmartSearch } from "@/shared/components/SmartSearch";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSocket } from "@/shared/hooks/useSocket";
import React, { useMemo, useState } from "react";
import { FiAlertCircle, FiPlus } from "react-icons/fi";
import type { Trade } from "../types";

const DEFAULT_SYMBOLS = ["BINANCE:BTCUSDT", "AAPL", "TSLA"];

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

  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [input, setInput] = useState("");

  // Auto-subscribe to initial symbols on mount/connection
  React.useEffect(() => {
    if (connected) {
      symbols.forEach(s => subscribe(s));
    }
    return () => {
      symbols.forEach(s => unsubscribe(s));
    };
  }, [connected, symbols, subscribe, unsubscribe]);

  const tradeMap = getTradeMap();

  const rows: Trade[] = useMemo(() => {
    return symbols.map((s) => {
      const t = tradeMap.get(s.toUpperCase());
      if (t) {
        return {
          ...t,
          updateCount: tradeStats.get(s.toUpperCase()) || 0,
        };
      }
      return {
        s,
        p: NaN,
        v: 0,
        snapshot: false,
        updateCount: 0,
      };
    });
  }, [symbols, tradeMap, tradeStats]);

  const handleAdd = () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;

    if (!symbols.includes(sym)) {
      setSymbols((prev) => [...prev, sym]);
    }

    // Always call subscribe to allow retrying/refreshing a connection
    subscribe(sym);
    setInput("");
  };

  const handleRemove = (sym: string) => {
    unsubscribe(sym);
    setSymbols((prev) => prev.filter((x) => x !== sym));
  };

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">Live Stock Data</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time market streaming
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary font-medium">
              {connected ? "Connected" : "Connecting..."}
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      {!hideHeader && (
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <SmartSearch
                onSubmit={(sym) => {
                  setInput(sym);
                  const newSymbols = sym.includes(',') ? sym.split(',').map(s => s.trim().toUpperCase()) : [sym.toUpperCase()];
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
                <div className="text-sm font-medium text-destructive">
                  Connection Error
                </div>
                <div className="text-sm text-destructive/80 mt-1">{error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Symbol", "Price", "Volume", "Last Time", "Status", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.s}
                className={`border-b border-border transition-colors ${index % 2 === 0 ? 'bg-muted/20 hover:bg-muted/40' : 'hover:bg-muted/30'}`}
              >
                <td className="py-3.5 px-6 font-semibold">
                  {row.s}
                </td>

                <td className="py-3.5 px-6 font-bold">
                  {Number.isFinite(row.p) ? `$${row.p.toFixed(2)}` : "—"}
                </td>

                <td className="py-3.5 px-6 text-muted-foreground">
                  {row.v ? row.v.toLocaleString() : "—"}
                </td>

                {!hideHeader && (
                  <td className="py-3.5 px-6 text-muted-foreground text-xs">
                    {row.t
                      ? new Date(row.t).toLocaleTimeString()
                      : "—"}
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

      {/* Footer */}
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
