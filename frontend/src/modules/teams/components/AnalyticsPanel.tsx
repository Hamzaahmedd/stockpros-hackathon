import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { formatPaisa } from "@/modules/plans/utils";
import { useEffect, useState } from "react";
import { teamService } from "../services";
import type { TeamAnalytics } from "../types";
import { featureLabel, formatDate } from "../utils";

/** Workspace usage: totals per feature, per-member consumption and credit spend, top symbols. */
export function AnalyticsPanel() {
  const [data, setData] = useState<TeamAnalytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    teamService
      .getAnalytics()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="text-sm text-muted-foreground">Usage analytics are unavailable right now.</p>;
  }
  if (!data) return <Skeleton className="h-40 w-full" />;

  const features = Object.keys(data.totalsByFeature);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Since {formatDate(data.windowStart)}</p>

      {features.length === 0 ? (
        <p className="text-sm text-muted-foreground">No usage recorded yet this cycle.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {features.map((feature) => (
            <div key={feature} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{featureLabel(feature)}</p>
              <p className="text-xl font-bold">{data.totalsByFeature[feature]}</p>
            </div>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            {features.map((feature) => (
              <TableHead key={feature} className="text-right">
                {featureLabel(feature)}
              </TableHead>
            ))}
            <TableHead className="text-right">Credits spent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.perMember.map((member) => (
            <TableRow key={member.userId}>
              <TableCell className="font-medium">{member.displayName}</TableCell>
              {features.map((feature) => (
                <TableCell key={feature} className="text-right">
                  {member.usageByFeature[feature] ?? 0}
                </TableCell>
              ))}
              <TableCell className="text-right">
                {formatPaisa(member.creditSpentPaisa)}
                {member.monthlyCreditLimitPaisa !== null && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    / {formatPaisa(member.monthlyCreditLimitPaisa)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Most researched symbols</h4>
          {data.topSymbols.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.topSymbols.map((row) => (
                <li key={row.symbol} className="flex justify-between">
                  <span>{row.symbol}</span>
                  <span className="text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            Active tickers ({data.activeTickers.length})
          </h4>
          <p className="text-sm text-muted-foreground break-words">
            {data.activeTickers.join(", ") || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
