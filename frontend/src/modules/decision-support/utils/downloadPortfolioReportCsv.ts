// utils/downloadPortfolioReportCsv.ts
// Exports the portfolio health report as a polished, sectioned CSV using ONLY
// data returned by the backend /api/v1/decision-support endpoints.
import { toCsvRow, triggerBrowserDownload } from '@/shared/utils/download';
import type { DetailedDecision, PortfolioData, PortfolioRiskMetrics } from '../types';
import {
    PORTFOLIO_DISCLAIMER,
    buildReportRows,
    computeRiskProfileLabel,
    formatCurrency,
    formatGeneratedAt,
    formatSignedCurrency,
    getReportFileName,
} from './portfolioReport';

const COLUMN_HEADERS = [
  'Symbol',
  'Sector',
  'Quantity',
  'Entry Price',
  'Current Price',
  'Market Value',
  'Unrealized P&L',
  'ROI %',
  'Beta',
  'Sharpe Ratio',
  'Market Decision',
  'Portfolio Decision',
  'Confidence %',
  'Risk Level',
  'Position Exposure %',
  'Sector Exposure %',
  'Over Exposed',
  'Hold Duration',
  'Take Profit Zone',
  'Stop Loss Zone',
  'AI Reasoning',
  'Risk Flags',
  'Watch For',
];

export const downloadPortfolioReportCsv = (
  portfolioData: PortfolioData,
  detailedPositions: DetailedDecision[],
  riskMetrics?: PortfolioRiskMetrics | null,
): void => {
  const { summary } = portfolioData;
  const rows = buildReportRows(portfolioData, detailedPositions, riskMetrics);

  const lines: string[] = [
    toCsvRow(['StockPros AI — Portfolio Health Report']),
    '',
    toCsvRow(['Report Summary']),
    toCsvRow(['Total Market Value', formatCurrency(summary.totalMarketValue)]),
    toCsvRow(['Unrealized P&L', formatSignedCurrency(summary.totalUnrealizedPnL)]),
    toCsvRow(['Overall ROI', `${summary.totalUnrealizedPnLPercent.toFixed(2)}%`]),
    toCsvRow(['Active Positions', summary.totalPositions]),
    toCsvRow(['Portfolio Beta', riskMetrics ? riskMetrics.weightedBeta.toFixed(2) : '1.00']),
    toCsvRow(['Portfolio Sharpe Ratio', riskMetrics ? riskMetrics.portfolioSharpe.toFixed(2) : '—']),
    toCsvRow(['Risk Profile', computeRiskProfileLabel(detailedPositions)]),
    toCsvRow(['Generated At', formatGeneratedAt()]),
    '',
    toCsvRow(['Position Analysis']),
    toCsvRow(COLUMN_HEADERS),
    ...rows.map((row) =>
      toCsvRow([
        row.symbol,
        row.sector === '—' ? '' : row.sector,
        row.quantity,
        row.entryPrice.toFixed(2),
        row.currentPrice.toFixed(2),
        row.marketValue.toFixed(2),
        row.unrealizedPnL.toFixed(2),
        row.roiPercent.toFixed(2),
        row.beta != null ? row.beta.toFixed(2) : '1.00',
        row.sharpe != null ? row.sharpe.toFixed(2) : '—',
        row.marketDecision,
        row.portfolioDecision,
        row.confidence != null ? (row.confidence * 100).toFixed(0) : '',
        row.riskLevel,
        row.positionExposurePercent?.toFixed(2) ?? '',
        row.sectorExposurePercent?.toFixed(2) ?? '',
        row.overExposed ? 'YES' : 'NO',
        row.holdDuration,
        row.takeProfitZone,
        row.stopLossZone,
        row.reasoningSummary,
        row.riskFlags.join('; '),
        row.watchFor.join('; '),
      ]),
    ),
    '',
    toCsvRow(['Note', PORTFOLIO_DISCLAIMER]),
  ];

  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerBrowserDownload(blob, getReportFileName('csv'));
};

