// utils/downloadForecastPdf.ts
// Exports the forecast as a polished PDF report using ONLY the data returned
// by the backend GET /api/v1/forecast route.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ForecastData } from '../types';
import {
    DISCLAIMER,
    TABLE_COLUMNS,
    formatGeneratedAt,
    getReportFileName,
    getSummaryFields,
    getTableRows,
} from './forecastExport';

const BRAND_BLUE: [number, number, number] = [37, 99, 235];
const INK_DARK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER_LIGHT: [number, number, number] = [229, 231, 235];
const ROW_ZEBRA: [number, number, number] = [248, 250, 252];

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

const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width minus margins

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

const drawHeader = (doc: jsPDF, data: ForecastData, logoImg?: HTMLImageElement | null): number => {
  doc.setFillColor(...INK_DARK);
  doc.rect(0, 0, 595.28, 96, 'F');
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 96, 595.28, 4, 'F');

  let textX = PAGE_MARGIN;
  if (logoImg) {
    try {
      doc.addImage(logoImg, 'PNG', PAGE_MARGIN, 22, 52, 52);
      textX = PAGE_MARGIN + 62;
    } catch {
      textX = PAGE_MARGIN;
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('StockPros AI', textX, 45);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('Price Forecast Report', textX, 64);

  doc.setFontSize(9);
  doc.text(
    [
      `Symbol: ${data.symbol.toUpperCase()}`,
      `Period: ${data.period === '1d' ? '1 Day' : '1 Week'}`,
      `Generated: ${formatGeneratedAt()}`,
    ],
    595.28 - PAGE_MARGIN,
    34,
    { align: 'right' },
  );

  return 126;
};

const drawSummary = (doc: jsPDF, data: ForecastData, startY: number): number => {
  let cursorY = drawSectionTitle(doc, 'Report Summary', startY);

  const fields = getSummaryFields(data);
  const columnWidth = CONTENT_WIDTH / 2;
  const rowHeight = 18;

  fields.forEach((field, index) => {
    const column = index % 2;
    const x = PAGE_MARGIN + column * columnWidth;

    if (column === 0 && index > 0) cursorY += rowHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(field.label.toUpperCase(), x, cursorY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK_DARK);
    doc.text(field.value, x, cursorY + 11);
  });

  return cursorY + rowHeight + 10;
};

const drawPriceTable = (doc: jsPDF, data: ForecastData, startY: number): number => {
  const cursorY = drawSectionTitle(doc, 'Forecast Data', startY);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 110, bottom: 80 },
    head: [TABLE_COLUMNS],
    body: getTableRows(data).map((row) => [
      row.date,
      `$${row.base.toFixed(2)}`,
      row.bull !== undefined ? `$${row.bull.toFixed(2)}` : '—',
      row.bear !== undefined ? `$${row.bear.toFixed(2)}` : '—',
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
      textColor: INK_DARK,
      lineColor: BORDER_LIGHT,
      lineWidth: 0.4,
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 8,
      textColor: TEXT_MUTED,
      fillColor: [243, 244, 246],
      lineColor: BORDER_LIGHT,
      lineWidth: 0.4,
    },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    alternateRowStyles: { fillColor: ROW_ZEBRA },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? cursorY + 40) + 24;
};

const drawDisclaimer = (doc: jsPDF, startY: number): void => {
  const lines = doc.splitTextToSize(DISCLAIMER, CONTENT_WIDTH);
  const boxHeight = lines.length * 11 + 20;

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
    doc.text(`Page ${page} of ${pageCount}`, PAGE_MARGIN, 818);
    doc.text('StockPros AI — Price Forecast Report', 595.28 - PAGE_MARGIN, 818, { align: 'right' });
  }
};

export const downloadForecastPdf = async (data: ForecastData): Promise<void> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const logoImg = await loadLogo();

  let cursorY = drawHeader(doc, data, logoImg);
  cursorY = drawSummary(doc, data, cursorY);
  cursorY = drawPriceTable(doc, data, cursorY);

  if (cursorY + 90 > 842 - PAGE_MARGIN) {
    doc.addPage();
    cursorY = PAGE_MARGIN;
  }
  drawDisclaimer(doc, cursorY);
  drawPageFooters(doc);

  doc.save(getReportFileName(data, 'pdf'));
};
