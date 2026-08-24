import { useEffect, useState } from "react";
import {
    FiTrendingDown,
    FiTrendingUp as FiUp,
} from "react-icons/fi";
import { useLocation } from "react-router-dom";

import { LiveStockTable } from "@/modules/markets/components/LiveStockTable";
import api from "@/shared/api/axios";
import { Sidebar } from "@/shared/components/Sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/shared/components/ui/table";
import { useTheme } from "@/shared/hooks/useTheme";
import type { StockData } from "../types";

/* ---------------- helpers ---------------- */

const fmtPrice = (v: number) =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: v < 100 ? 2 : 0,
    maximumFractionDigits: v < 100 ? 4 : 0,
  })}`;

const fmtTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleTimeString();

/* ---------------- component ---------------- */

const Markets = () => {
  const { theme } = useTheme();
  useLocation();

  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStocks = async () => {
    try {
      const res = await api.get("/api/v1/market/top-stocks");
      if (res.data?.success) {
        setStocks(res.data.data);
      }
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
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Markets
              </h1>
              <div className="text-sm text-muted-foreground">
                Real-time & snapshot US stock market data
              </div>
            </div>
          </div>

          <Card className="overflow-hidden">
             <LiveStockTable />
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">
              Most Active Stocks
            </h2>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[50px] py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Rank</TableHead>
                      <TableHead className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Symbol</TableHead>
                      <TableHead className="w-[200px] py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Price</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Change %</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Open</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">High</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Low</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Prev Close</TableHead>
                      <TableHead className="text-right py-3 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-${i}`} className="border-border">
                          <TableCell className="py-3.5 px-6"><Skeleton className="h-4 w-6" /></TableCell>
                          <TableCell className="py-3.5 px-6">
                            <div className="flex items-center gap-2">
                              <Skeleton className="w-7 h-7 rounded-full" />
                              <Skeleton className="h-4 w-12" />
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 px-6"><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                          <TableCell className="py-3.5 px-6 text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      stocks.map((r, index) => (
                        <TableRow
                          key={r.symbol}
                          className={`border-border transition-colors whitespace-nowrap ${
                            index % 2 === 0 ? 'bg-muted/20 hover:bg-muted/40' : 'hover:bg-muted/30'
                          }`}
                        >
                          <TableCell className="py-3.5 px-6 text-muted-foreground font-semibold">{index + 1}</TableCell>
                          <TableCell className="py-3.5 px-6 font-bold">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-7 h-7 bg-muted/50">
                                <AvatarImage src={r.logoUrl} alt={r.symbol} />
                                <AvatarFallback className="text-[10px]">{r.symbol.slice(0,2)}</AvatarFallback>
                              </Avatar>
                              {r.symbol}
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
                      ))
                    )}
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
