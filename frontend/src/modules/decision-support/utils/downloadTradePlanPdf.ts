// frontend/src/modules/decision-support/utils/downloadTradePlanPdf.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PositionSizeResult, RadarCard } from '../types';
import { formatCurrency, formatSignedCurrency } from './portfolioReport';

const INK_DARK: [number, number, number] = [17, 24, 39];
const BRAND_BLUE: [number, number, number] = [37, 99, 235];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER_LIGHT: [number, number, number] = [229, 231, 235];
const POSITIVE_GREEN: [number, number, number] = [5, 150, 105];
const NEGATIVE_RED: [number, number, number] = [220, 38, 38];
const WARNING_ORANGE: [number, number, number] = [234, 88, 12];

const STOCKPROS_LOGO_URL =
  'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png';

const loadLogo = (url: string = STOCKPROS_LOGO_URL): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 842;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

export interface TradePlanData {
  symbol: string;
  sector?: string;
  currentPrice: number;
  atr?: number;
  recommendation: string;
  confidence: number;
  timeHorizon?: string;
  entryRange: { low: number; high: number };
  bullTarget: number;
  stopLoss: number;
  riskFlags?: string[];
  sizing?: PositionSizeResult;
}

export const downloadTradePlanPdf = async (plan: TradePlanData | (RadarCard & { sizing?: PositionSizeResult })): Promise<void> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const logoImg = await loadLogo();

  // ── Header Banner ──
  doc.setFillColor(...INK_DARK);
  doc.rect(0, 0, PAGE_WIDTH, 90, 'F');
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 90, PAGE_WIDTH, 4, 'F');

  let textX = PAGE_MARGIN;
  if (logoImg) {
    try {
      doc.addImage(logoImg, 'PNG', PAGE_MARGIN, 20, 50, 50);
      textX = PAGE_MARGIN + 60;
    } catch {
      textX = PAGE_MARGIN;
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('StockPros AI', textX, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Pre-Trade Plan & Risk Summary', textX, 60);

  doc.setFontSize(9);
  doc.text(
    [
      `Ticker: ${plan.symbol.toUpperCase()}`,
      `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
    ],
    PAGE_WIDTH - PAGE_MARGIN,
    38,
    { align: 'right' },
  );

  let cursorY = 120;

  // ── Executive Signal Overview ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK_DARK);
  doc.text(`TRADE INTELLIGENCE — ${plan.symbol.toUpperCase()}`, PAGE_MARGIN, cursorY);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4);
  cursorY += 20;

  autoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: INK_DARK },
    headStyles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: TEXT_MUTED },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Asset', 'Sector', 'Current Price', 'AI Signal', 'Confidence', 'Time Horizon']],
    body: [
      [
        plan.symbol.toUpperCase(),
        plan.sector || 'Equities',
        formatCurrency(plan.currentPrice),
        plan.recommendation.toUpperCase(),
        `${(plan.confidence * 100).toFixed(0)}%`,
        plan.timeHorizon || 'Short-to-Medium Term',
      ],
    ],
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.fontStyle = 'bold';
        if (plan.recommendation.includes('BUY')) data.cell.styles.textColor = POSITIVE_GREEN;
        else if (plan.recommendation.includes('SELL')) data.cell.styles.textColor = NEGATIVE_RED;
        else data.cell.styles.textColor = WARNING_ORANGE;
      }
    },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 25;

  // ── Key Price Targets & ATR Levels ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK_DARK);
  doc.text('KEY PRICE TARGETS & TECHNICAL LEVELS', PAGE_MARGIN, cursorY);
  doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4);
  cursorY += 20;

  const atrVal = plan.atr ? `$${plan.atr.toFixed(2)}` : '—';
  const entryStr = `$${plan.entryRange.low.toFixed(2)} – $${plan.entryRange.high.toFixed(2)}`;

  autoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: INK_DARK },
    headStyles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: TEXT_MUTED },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Level Type', 'Price ($)', 'ATR Volatility', 'Description']],
    body: [
      ['Optimal Entry Range', entryStr, atrVal, 'Accumulation zone based on daily volatility bands'],
      ['Bull Target (+2 ATR)', formatCurrency(plan.bullTarget), atrVal, 'Primary technical upside objective for profit-taking'],
      ['Stop-Loss (-1.5 ATR)', formatCurrency(plan.stopLoss), atrVal, 'Strict invalidation level for risk containment'],
    ],
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.row.index === 1 && data.column.index === 1) {
          data.cell.styles.textColor = POSITIVE_GREEN;
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.index === 2 && data.column.index === 1) {
          data.cell.styles.textColor = NEGATIVE_RED;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 25;

  // ── Position Sizing / Capital Allocation ──
  if (plan.sizing) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK_DARK);
    doc.text('POSITION SIZING & CAPITAL MANAGEMENT', PAGE_MARGIN, cursorY);
    doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4);
    cursorY += 20;

    autoTable(doc, {
      startY: cursorY,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: INK_DARK },
      headStyles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: TEXT_MUTED },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Budget Capital', 'Calculated Shares', 'Max Capital Risk ($)', 'Potential Upside ($)', 'Risk / Reward Ratio', '% Capital Allocated']],
      body: [
        [
          formatCurrency(plan.sizing.capital),
          `${plan.sizing.shares} shares`,
          formatSignedCurrency(-Math.abs(plan.sizing.totalRisk)),
          formatSignedCurrency(plan.sizing.potentialGain),
          `${plan.sizing.riskRewardRatio.toFixed(2)} : 1`,
          `${plan.sizing.percentOfCapital.toFixed(1)}%`,
        ],
      ],
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 2) {
            data.cell.styles.textColor = NEGATIVE_RED;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 3) {
            data.cell.styles.textColor = POSITIVE_GREEN;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 4) {
            data.cell.styles.textColor = BRAND_BLUE;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 25;
  }

  // ── Risk Flags ──
  if (plan.riskFlags && plan.riskFlags.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK_DARK);
    doc.text('ACTIVE RISK PROTOCOLS & FLAGS', PAGE_MARGIN, cursorY);
    doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4);
    cursorY += 18;

    plan.riskFlags.forEach((flag) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...NEGATIVE_RED);
      doc.text(`• ${flag.replace(/_/g, ' ')}`, PAGE_MARGIN + 10, cursorY);
      cursorY += 14;
    });

    cursorY += 10;
  }

  // ── Disclaimer ──
  const disclaimer =
    'NOTICE: This trade plan summary is generated algorithmically by StockPros Decision Support protocols based on technical indicators and market data. ' +
    'Past performance is no guarantee of future returns. Manage position sizes responsibly and adhere to defined stop-loss thresholds.';

  const lines = doc.splitTextToSize(disclaimer, CONTENT_WIDTH - 20);
  const boxHeight = lines.length * 11 + 20;

  if (cursorY + boxHeight > PAGE_HEIGHT - 40) {
    cursorY = PAGE_HEIGHT - boxHeight - 40;
  }

  doc.setFillColor(243, 244, 246);
  doc.roundedRect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, boxHeight, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK_DARK);
  doc.text('RISK DISCLAIMER', PAGE_MARGIN + 10, cursorY + 12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(lines, PAGE_MARGIN + 10, cursorY + 24);

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('StockPros AI — Decision Support Intelligence', PAGE_MARGIN, PAGE_HEIGHT - 20);
  doc.text('Page 1 of 1', PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 20, { align: 'right' });

  doc.save(`stockpros_trade_plan_${plan.symbol.toUpperCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
};
