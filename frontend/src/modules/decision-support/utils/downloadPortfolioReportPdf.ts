// utils/downloadPortfolioReportPdf.ts
// Exports the portfolio health report as a polished PDF using ONLY data
// returned by the backend /api/v1/decision-support endpoints.
import jsPDF from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import type { DetailedDecision, PortfolioData, PortfolioRiskMetrics } from '../types';
import {
    PORTFOLIO_DISCLAIMER,
    buildReportRows,
    computeRiskProfileLabel,
    formatConfidence,
    formatCurrency,
    formatEnabledStrategies,
    formatGeneratedAt,
    formatSignedCurrency,
    getReportFileName,
    type PortfolioReportRow,
} from './portfolioReport';

const INK_DARK: [number, number, number] = [17, 24, 39];
const BRAND_BLUE: [number, number, number] = [37, 99, 235];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER_LIGHT: [number, number, number] = [229, 231, 235];
const ROW_ZEBRA: [number, number, number] = [248, 250, 252];
const POSITIVE_GREEN: [number, number, number] = [5, 150, 105];
const NEGATIVE_RED: [number, number, number] = [220, 38, 38];
const WARNING_ORANGE: [number, number, number] = [234, 88, 12];

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 842;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const DECISION_COLORS: Record<string, [number, number, number]> = {
  ADD: POSITIVE_GREEN,
  BUY: POSITIVE_GREEN,
  HOLD: TEXT_MUTED,
  TRIM: WARNING_ORANGE,
  SELL: NEGATIVE_RED,
  EXIT: NEGATIVE_RED,
  HIGH: NEGATIVE_RED,
  MEDIUM: WARNING_ORANGE,
  LOW: POSITIVE_GREEN,
};

const signedMoney = (value: number): string => formatSignedCurrency(value);

const drawSectionTitle = (doc: jsPDF, title: string, y: number): number => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK_DARK);
  doc.text(title, PAGE_MARGIN, y);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.6);
  doc.line(PAGE_MARGIN, y + 5, PAGE_MARGIN + CONTENT_WIDTH, y + 5);
  return y + 20;
};

const drawHeader = (doc: jsPDF, portfolioData: PortfolioData): number => {
  doc.setFillColor(...INK_DARK);
  doc.rect(0, 0, PAGE_WIDTH, 96, 'F');
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 96, PAGE_WIDTH, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('StockPros AI', PAGE_MARGIN, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('Portfolio Health Report', PAGE_MARGIN, 58);

  doc.setFontSize(9);
  doc.text(
    [
      `Active Positions: ${portfolioData.summary.totalPositions}`,
      `Generated: ${formatGeneratedAt()}`,
    ],
    PAGE_WIDTH - PAGE_MARGIN,
    40,
    { align: 'right' },
  );

  return 126;
};

const drawSummary = (
  doc: jsPDF,
  portfolioData: PortfolioData,
  riskLabel: string,
  riskMetrics: PortfolioRiskMetrics | null | undefined,
  startY: number,
): number => {
  let cursorY = drawSectionTitle(doc, 'Portfolio Summary', startY);

  const { summary } = portfolioData;
  const fields = [
    { label: 'Total Market Value', value: formatCurrency(summary.totalMarketValue) },
    { label: 'Unrealized P&L', value: formatSignedCurrency(summary.totalUnrealizedPnL) },
    { label: 'Overall ROI', value: `${summary.totalUnrealizedPnLPercent.toFixed(2)}%` },
    { label: 'Active Positions', value: String(summary.totalPositions) },
    { label: 'Portfolio Beta', value: riskMetrics ? `${riskMetrics.weightedBeta.toFixed(2)}` : '1.00' },
    { label: 'Portfolio Sharpe', value: riskMetrics ? `${riskMetrics.portfolioSharpe.toFixed(2)}` : '—' },
    { label: 'Risk Profile', value: riskLabel },
  ];

  const columnWidth = CONTENT_WIDTH / 3;
  const rowHeight = 18;

  fields.forEach((field, index) => {
    const column = index % 3;
    if (column === 0 && index > 0) cursorY += rowHeight * 2;

    const x = PAGE_MARGIN + column * columnWidth;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(field.label.toUpperCase(), x, cursorY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK_DARK);
    doc.text(field.value, x, cursorY + 12);
  });

  return cursorY + rowHeight * 2 + 6;
};

const tableStyles: Partial<UserOptions> = {
  theme: 'plain',
  styles: {
    font: 'helvetica',
    fontSize: 8.5,
    cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
    textColor: INK_DARK,
    lineColor: BORDER_LIGHT,
    lineWidth: 0.4,
  },
  headStyles: {
    fontStyle: 'bold',
    fontSize: 7.5,
    textColor: TEXT_MUTED,
    fillColor: [243, 244, 246],
    lineColor: BORDER_LIGHT,
    lineWidth: 0.4,
  },
  alternateRowStyles: { fillColor: ROW_ZEBRA },
  margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
};

const drawHoldingsTable = (doc: jsPDF, rows: PortfolioReportRow[], startY: number): number => {
  const cursorY = drawSectionTitle(doc, 'Holdings & Performance', startY);

  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [['Symbol', 'Sector', 'Qty', 'Entry', 'Current', 'Market Value', 'Unrealized P&L', 'ROI %', 'Beta', 'Sharpe']],
    body: rows.map((row) => [
      row.symbol,
      row.sector,
      String(row.quantity),
      formatCurrency(row.entryPrice),
      formatCurrency(row.currentPrice),
      formatCurrency(row.marketValue),
      signedMoney(row.unrealizedPnL),
      `${row.roiPercent.toFixed(2)}%`,
      row.beta != null ? row.beta.toFixed(2) : '1.00',
      row.sharpe != null ? row.sharpe.toFixed(2) : '—',
    ]),
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'center' },
      9: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || (data.column.index !== 6 && data.column.index !== 7)) return;
      const row = rows[data.row.index];
      const positive = data.column.index === 6 ? row.unrealizedPnL >= 0 : row.roiPercent >= 0;
      data.cell.styles.textColor = positive ? POSITIVE_GREEN : NEGATIVE_RED;
      data.cell.styles.fontStyle = 'bold';
    },
  });

  return tableEnd(doc, cursorY);
};

const drawDecisionsTable = (doc: jsPDF, rows: PortfolioReportRow[], startY: number): number => {
  const cursorY = drawSectionTitle(doc, 'AI Decisions & Risk', startY);

  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [['Symbol', 'Market Signal', 'Portfolio Action', 'Confidence', 'Risk', 'Position %', 'Sector %', 'Over-Exposed']],
    body: rows.map((row) => [
      row.symbol,
      row.marketDecision,
      row.portfolioDecision,
      formatConfidence(row.confidence),
      row.riskLevel,
      row.positionExposurePercent != null ? `${row.positionExposurePercent.toFixed(2)}%` : '—',
      row.sectorExposurePercent != null ? `${row.sectorExposurePercent.toFixed(2)}%` : '—',
      row.overExposed ? 'YES' : 'NO',
    ]),
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const rawText = typeof data.cell.raw === 'string' ? data.cell.raw : '';
      const colorKey = [1, 2, 4].includes(data.column.index) ? rawText : null;
      const color = colorKey ? DECISION_COLORS[colorKey] : undefined;
      if (color) {
        data.cell.styles.textColor = color;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 7 && rawText === 'YES') {
        data.cell.styles.textColor = NEGATIVE_RED;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  return tableEnd(doc, cursorY);
};

const drawGuidanceTable = (doc: jsPDF, rows: PortfolioReportRow[], startY: number): number => {
  const cursorY = drawSectionTitle(doc, 'Action Guidance', startY);

  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [['Symbol', 'Strategy', 'Hold Duration', 'Take Profit', 'Stop Loss', 'Watch For']],
    body: rows.map((row) => [
      row.symbol,
      formatEnabledStrategies(row),
      row.holdDuration || '—',
      row.takeProfitZone ? `$${row.takeProfitZone}` : '—',
      row.stopLossZone ? `$${row.stopLossZone}` : '—',
      row.watchFor.length > 0 ? row.watchFor.join('; ') : '—',
    ]),
    columnStyles: {
      3: { halign: 'right', cellWidth: 62 },
      4: { halign: 'right', cellWidth: 62 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 3) data.cell.styles.textColor = POSITIVE_GREEN;
      if (data.column.index === 4) data.cell.styles.textColor = NEGATIVE_RED;
    },
  });

  return tableEnd(doc, cursorY);
};

const drawReasoningTable = (doc: jsPDF, rows: PortfolioReportRow[], startY: number): number => {
  const cursorY = drawSectionTitle(doc, 'AI Reasoning', startY);

  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [['Symbol', 'Analysis & Risk Flags']],
    body: rows.map((row) => [
      row.symbol,
      [row.reasoningSummary, row.riskFlags.length > 0 ? `Risk flags: ${row.riskFlags.join('; ')}` : '']
        .filter(Boolean)
        .join('\n'),
    ]),
    styles: { ...tableStyles.styles, fontSize: 8, valign: 'top' as const },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
    },
  });

  return tableEnd(doc, cursorY);
};

const tableEnd = (doc: jsPDF, fallback: number): number => {
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? fallback + 40) + 22;
};

const drawDisclaimer = (doc: jsPDF, startY: number): void => {
  const lines = doc.splitTextToSize(PORTFOLIO_DISCLAIMER, CONTENT_WIDTH);
  const boxHeight = lines.length * 11 + 24;

  doc.setFillColor(243, 244, 246);
  doc.roundedRect(PAGE_MARGIN, startY, CONTENT_WIDTH, boxHeight, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK_DARK);
  doc.text('IMPORTANT NOTICE', PAGE_MARGIN + 10, startY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(lines, PAGE_MARGIN + 10, startY + 26);
};

const drawPageFooters = (doc: jsPDF): void => {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_MARGIN, PAGE_HEIGHT - 24);
    doc.text('StockPros AI — Portfolio Health Report', PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 24, {
      align: 'right',
    });
  }
};

export const downloadPortfolioReportPdf = (
  portfolioData: PortfolioData,
  detailedPositions: DetailedDecision[],
  riskMetrics?: PortfolioRiskMetrics | null,
): void => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const rows = buildReportRows(portfolioData, detailedPositions, riskMetrics);
  const riskLabel = computeRiskProfileLabel(detailedPositions);

  let cursorY = drawHeader(doc, portfolioData);
  cursorY = drawSummary(doc, portfolioData, riskLabel, riskMetrics, cursorY);
  cursorY = drawHoldingsTable(doc, rows, cursorY);
  cursorY = drawDecisionsTable(doc, rows, cursorY);
  cursorY = drawGuidanceTable(doc, rows, cursorY);
  cursorY = drawReasoningTable(doc, rows, cursorY);

  if (cursorY + 90 > PAGE_HEIGHT - PAGE_MARGIN) {
    doc.addPage();
    cursorY = PAGE_MARGIN;
  }
  drawDisclaimer(doc, cursorY);
  drawPageFooters(doc);

  doc.save(getReportFileName('pdf'));
};
