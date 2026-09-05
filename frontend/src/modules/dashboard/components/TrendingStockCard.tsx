import React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export const StockTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover text-popover-foreground border border-border px-2.5 py-1.5 rounded-lg shadow-xl text-xs font-mono">
        <div className="text-muted-foreground text-[10px]">Price</div>
        <div className="font-bold tabular-nums">${Number(payload[0].value).toFixed(2)}</div>
      </div>
    );
  }
  return null;
};

export const TrendingStockCard: React.FC<{ stock: any }> = ({ stock }) => {
  const changePercent = Number(stock.changePercent);
  const price = Number(stock.price);
  const isPositive = Number.isFinite(changePercent) ? changePercent >= 0 : true;
  
  const chartData = stock.sparkline?.map((p: number, idx: number) => ({
    name: idx,
    value: p,
  })) || [];

  const formattedChangePercent = (() => {
    if (!Number.isFinite(changePercent)) return "—";
    const prefix = isPositive ? "+" : "";
    return `${prefix}${changePercent.toFixed(2)}%`;
  })();

  return (
    <div className="rounded-xl border border-border/70 terminal-glass transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 flex flex-col justify-between overflow-hidden group">
      <div className="p-4 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-border/80 bg-muted/40 flex items-center justify-center p-1.5 shrink-0">
             {stock.logoUrl ? (
                <img src={stock.logoUrl} alt={stock.symbol} className="w-full h-full object-contain" />
             ) : (
                <div className="text-xs font-mono font-bold text-primary">{stock.symbol.slice(0, 2)}</div>
             )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-mono font-bold tracking-wider text-foreground truncate">{stock.symbol}</div>
            <div className="text-[11px] text-muted-foreground font-medium truncate max-w-[130px]">{stock.companyName}</div>
          </div>
        </div>
        <div className="text-right font-mono">
          <div className="text-base font-bold tracking-tight tabular-nums text-foreground">
            {Number.isFinite(price) ? `$${price.toFixed(2)}` : "—"}
          </div>
          <div className={`text-[11px] font-semibold tabular-nums inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
            isPositive
              ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
              : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
          }`}>
            {formattedChangePercent}
          </div>
        </div>
      </div>

      <div className="h-16 w-full -mb-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.35}/>
                <stop offset="95%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <Tooltip content={<StockTooltip />} />
            <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
            <Area 
               type="monotone" 
               dataKey="value" 
               stroke={isPositive ? '#10b981' : '#f43f5e'} 
               fill={`url(#grad-${stock.symbol})`} 
               strokeWidth={1.75}
               isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
