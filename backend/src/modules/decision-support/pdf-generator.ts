import { jsPDF } from 'jspdf'
import autoTable, { type UserOptions } from 'jspdf-autotable'
import { getStockProsLogoDataUri } from '../../shared/utils'

// ─── Colors ──────────────────────────────────────────────────────────────────
const INK_DARK: [number, number, number] = [17, 24, 39]
const BRAND_BLUE: [number, number, number] = [37, 99, 235]
const TEXT_MUTED: [number, number, number] = [107, 114, 128]
const BORDER_LIGHT: [number, number, number] = [229, 231, 235]
const ROW_ZEBRA: [number, number, number] = [248, 250, 252]
const POSITIVE_GREEN: [number, number, number] = [5, 150, 105]
const NEGATIVE_RED: [number, number, number] = [220, 38, 38]
const WARNING_ORANGE: [number, number, number] = [234, 88, 12]

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 842

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatCurrency = (value: number | undefined | null): string =>
  currencyFormatter.format(Number(value ?? 0))

const formatSignedCurrency = (value: number | undefined | null): string => {
  const num = Number(value ?? 0)
  return `${num >= 0 ? '+' : '-'}${currencyFormatter.format(Math.abs(num))}`
}

const formatGeneratedAt = (): string =>
  new Date().toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  })

// ─── Trade Plan PDF ──────────────────────────────────────────────────────────

export interface TradePlanData {
  symbol: string
  sector?: string
  currentPrice: number
  atr?: number
  recommendation: string
  confidence: number
  timeHorizon?: string
  entryRange?: { low: number; high: number }
  bullTarget?: number
  stopLoss?: number
  riskFlags?: string[]
  sizing?: {
    capital: number
    shares: number
    totalRisk: number
    potentialGain: number
    riskRewardRatio: number
    percentOfCapital: number
  }
}

export const generateTradePlanPdfBuffer = async (
  plan: TradePlanData,
): Promise<Buffer> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const logoDataUri = await getStockProsLogoDataUri()
  const PAGE_MARGIN = 40
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2

  // Header Banner
  doc.setFillColor(...INK_DARK)
  doc.rect(0, 0, PAGE_WIDTH, 90, 'F')
  doc.setFillColor(...BRAND_BLUE)
  doc.rect(0, 90, PAGE_WIDTH, 4, 'F')

  let textX = PAGE_MARGIN
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, 'PNG', PAGE_MARGIN, 20, 50, 50)
      textX = PAGE_MARGIN + 60
    } catch {
      textX = PAGE_MARGIN
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('StockPros AI', textX, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Pre-Trade Plan & Risk Summary', textX, 60)

  doc.setFontSize(9)
  doc.text(
    [
      `Ticker: ${plan.symbol.toUpperCase()}`,
      `Generated: ${formatGeneratedAt()}`,
    ],
    PAGE_WIDTH - PAGE_MARGIN,
    38,
    { align: 'right' },
  )

  let cursorY = 120

  // Executive Signal Overview
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK_DARK)
  doc.text(
    `TRADE INTELLIGENCE — ${plan.symbol.toUpperCase()}`,
    PAGE_MARGIN,
    cursorY,
  )
  doc.setDrawColor(...BORDER_LIGHT)
  doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4)
  cursorY += 20

  autoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      textColor: INK_DARK,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      fontStyle: 'bold',
      textColor: TEXT_MUTED,
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [
      [
        'Asset',
        'Sector',
        'Current Price',
        'AI Signal',
        'Confidence',
        'Time Horizon',
      ],
    ],
    body: [
      [
        plan.symbol.toUpperCase(),
        plan.sector || 'Equities',
        formatCurrency(plan.currentPrice),
        (plan.recommendation || 'HOLD').toUpperCase(),
        `${((plan.confidence ?? 0.5) * 100).toFixed(0)}%`,
        plan.timeHorizon || 'Short-to-Medium Term',
      ],
    ],
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.fontStyle = 'bold'
        const rec = plan.recommendation || ''
        if (rec.includes('BUY')) data.cell.styles.textColor = POSITIVE_GREEN
        else if (rec.includes('SELL')) data.cell.styles.textColor = NEGATIVE_RED
        else data.cell.styles.textColor = WARNING_ORANGE
      }
    },
  })

  cursorY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? cursorY + 50
  cursorY += 25

  // Key Price Targets & ATR Levels
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK_DARK)
  doc.text('KEY PRICE TARGETS & TECHNICAL LEVELS', PAGE_MARGIN, cursorY)
  doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4)
  cursorY += 20

  const atrVal = plan.atr ? `$${Number(plan.atr).toFixed(2)}` : '—'
  const low = plan.entryRange?.low ?? plan.currentPrice
  const high = plan.entryRange?.high ?? plan.currentPrice
  const entryStr = `$${low.toFixed(2)} – $${high.toFixed(2)}`

  autoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      textColor: INK_DARK,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      fontStyle: 'bold',
      textColor: TEXT_MUTED,
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Level Type', 'Price ($)', 'ATR Volatility', 'Description']],
    body: [
      [
        'Optimal Entry Range',
        entryStr,
        atrVal,
        'Accumulation zone based on daily volatility bands',
      ],
      [
        'Bull Target (+2 ATR)',
        formatCurrency(plan.bullTarget),
        atrVal,
        'Primary technical upside objective for profit-taking',
      ],
      [
        'Stop-Loss (-1.5 ATR)',
        formatCurrency(plan.stopLoss),
        atrVal,
        'Strict invalidation level for risk containment',
      ],
    ],
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.row.index === 1 && data.column.index === 1) {
          data.cell.styles.textColor = POSITIVE_GREEN
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.row.index === 2 && data.column.index === 1) {
          data.cell.styles.textColor = NEGATIVE_RED
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  cursorY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? cursorY + 50
  cursorY += 25

  // Position Sizing / Capital Management
  if (plan.sizing) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...INK_DARK)
    doc.text('POSITION SIZING & CAPITAL MANAGEMENT', PAGE_MARGIN, cursorY)
    doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4)
    cursorY += 20

    autoTable(doc, {
      startY: cursorY,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 6,
        textColor: INK_DARK,
      },
      headStyles: {
        fillColor: [243, 244, 246],
        fontStyle: 'bold',
        textColor: TEXT_MUTED,
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [
        [
          'Budget Capital',
          'Calculated Shares',
          'Max Capital Risk ($)',
          'Potential Upside ($)',
          'Risk / Reward Ratio',
          '% Capital Allocated',
        ],
      ],
      body: [
        [
          formatCurrency(plan.sizing.capital),
          `${plan.sizing.shares} shares`,
          formatSignedCurrency(-Math.abs(plan.sizing.totalRisk)),
          formatSignedCurrency(plan.sizing.potentialGain),
          `${Number(plan.sizing.riskRewardRatio).toFixed(2)} : 1`,
          `${Number(plan.sizing.percentOfCapital).toFixed(1)}%`,
        ],
      ],
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 2) {
            data.cell.styles.textColor = NEGATIVE_RED
            data.cell.styles.fontStyle = 'bold'
          }
          if (data.column.index === 3) {
            data.cell.styles.textColor = POSITIVE_GREEN
            data.cell.styles.fontStyle = 'bold'
          }
          if (data.column.index === 4) {
            data.cell.styles.textColor = BRAND_BLUE
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })

    cursorY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? cursorY + 50
    cursorY += 25
  }

  // Risk Flags
  if (plan.riskFlags && plan.riskFlags.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...INK_DARK)
    doc.text('ACTIVE RISK PROTOCOLS & FLAGS', PAGE_MARGIN, cursorY)
    doc.line(PAGE_MARGIN, cursorY + 4, PAGE_MARGIN + CONTENT_WIDTH, cursorY + 4)
    cursorY += 18

    plan.riskFlags.forEach((flag) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...NEGATIVE_RED)
      doc.text(`• ${flag.replace(/_/g, ' ')}`, PAGE_MARGIN + 10, cursorY)
      cursorY += 14
    })

    cursorY += 10
  }

  // Disclaimer
  const disclaimer =
    'NOTICE: This trade plan summary is generated algorithmically by StockPros Decision Support protocols based on technical indicators and market data. ' +
    'Past performance is no guarantee of future returns. Manage position sizes responsibly and adhere to defined stop-loss thresholds.'

  const lines = doc.splitTextToSize(disclaimer, CONTENT_WIDTH - 20)
  const boxHeight = lines.length * 11 + 20

  if (cursorY + boxHeight > PAGE_HEIGHT - 40) {
    cursorY = PAGE_HEIGHT - boxHeight - 40
  }

  doc.setFillColor(243, 244, 246)
  doc.roundedRect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, boxHeight, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...INK_DARK)
  doc.text('RISK DISCLAIMER', PAGE_MARGIN + 10, cursorY + 12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text(lines, PAGE_MARGIN + 10, cursorY + 24)

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    'StockPros AI — Decision Support Intelligence',
    PAGE_MARGIN,
    PAGE_HEIGHT - 20,
  )
  doc.text('Page 1 of 1', PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 20, {
    align: 'right',
  })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Portfolio Health Report PDF ─────────────────────────────────────────────

export interface PortfolioPdfPayload {
  portfolioData: {
    positions?: Array<{
      symbol: string
      sector?: string
      quantity: number
      avg_entry_price: number
      currentPrice: number
      currentValue: number
      unrealizedPnL: number
      unrealizedPnLPercent: number
    }>
    summary: {
      totalMarketValue: number
      totalUnrealizedPnL: number
      totalUnrealizedPnLPercent: number
      totalPositions: number
    }
  }
  detailedPositions?: Array<{
    symbol: string
    sector?: string
    marketDecision?: string
    portfolioDecision?: string
    confidence?: number | null
    riskLevel?: string
    beta?: number | null
    sharpe?: number | null
    volatilityAnnualized?: number | null
    reasoning?: {
      summary?: string
      details?: string[]
    }
    exposure?: {
      positionPercent?: number | null
      sectorPercent?: number | null
      isOverExposed?: boolean
    }
    actionGuidance?: {
      positionStrategy?: {
        add: boolean
        hold: boolean
        trim: boolean
        exit: boolean
      } | null
      holdDuration?: string
      takeProfitZone?: string
      stopLossZone?: string
      watchFor?: string[]
    }
  }>
  riskMetrics?: {
    weightedBeta: number
    portfolioSharpe: number
    perSymbol?: Array<{
      symbol: string
      beta?: number | null
      sharpe?: number | null
      volatilityAnnualized?: number | null
    }>
  } | null
}

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
}

const PORTFOLIO_DISCLAIMER =
  'Portfolio analysis is generated by AI models based on position data, market signals and technical indicators. ' +
  'This report is for informational purposes only and does not constitute financial advice.'

export const generatePortfolioReportPdfBuffer = async (
  payload: PortfolioPdfPayload,
): Promise<Buffer> => {
  const { portfolioData, detailedPositions = [], riskMetrics } = payload
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const logoDataUri = await getStockProsLogoDataUri()

  const PAGE_MARGIN = 48
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2

  const drawSecTitle = (title: string, y: number): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INK_DARK)
    doc.text(title, PAGE_MARGIN, y)
    doc.setDrawColor(...BORDER_LIGHT)
    doc.setLineWidth(0.6)
    doc.line(PAGE_MARGIN, y + 5, PAGE_MARGIN + CONTENT_WIDTH, y + 5)
    return y + 20
  }

  // Header
  doc.setFillColor(...INK_DARK)
  doc.rect(0, 0, PAGE_WIDTH, 96, 'F')
  doc.setFillColor(...BRAND_BLUE)
  doc.rect(0, 96, PAGE_WIDTH, 4, 'F')

  let textX = PAGE_MARGIN
  if (logoDataUri) {
    try {
      doc.addImage(logoDataUri, 'PNG', PAGE_MARGIN, 22, 52, 52)
      textX = PAGE_MARGIN + 62
    } catch {
      textX = PAGE_MARGIN
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('StockPros AI', textX, 45)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Portfolio Health Report', textX, 64)

  doc.setFontSize(9)
  doc.text(
    [
      `Active Positions: ${portfolioData?.summary?.totalPositions ?? 0}`,
      `Generated: ${formatGeneratedAt()}`,
    ],
    PAGE_WIDTH - PAGE_MARGIN,
    40,
    { align: 'right' },
  )

  let cursorY = 126

  // Portfolio Summary
  cursorY = drawSecTitle('Portfolio Summary', cursorY)
  const summary = portfolioData?.summary || {
    totalMarketValue: 0,
    totalUnrealizedPnL: 0,
    totalUnrealizedPnLPercent: 0,
    totalPositions: 0,
  }

  // Risk profile computation
  const highCount = detailedPositions.filter(
    (d) => d.riskLevel === 'HIGH',
  ).length
  const ratio = detailedPositions.length
    ? highCount / detailedPositions.length
    : 0
  const riskLabel =
    detailedPositions.length === 0
      ? 'Not Assessed'
      : ratio >= 0.6
        ? 'Aggressive'
        : ratio >= 0.3
          ? 'Moderate'
          : 'Conservative'

  const fields = [
    {
      label: 'Total Market Value',
      value: formatCurrency(summary.totalMarketValue),
    },
    {
      label: 'Unrealized P&L',
      value: formatSignedCurrency(summary.totalUnrealizedPnL),
    },
    {
      label: 'Overall ROI',
      value: `${Number(summary.totalUnrealizedPnLPercent || 0).toFixed(2)}%`,
    },
    { label: 'Active Positions', value: String(summary.totalPositions || 0) },
    {
      label: 'Portfolio Beta',
      value: riskMetrics
        ? `${Number(riskMetrics.weightedBeta).toFixed(2)}`
        : '1.00',
    },
    {
      label: 'Portfolio Sharpe',
      value: riskMetrics
        ? `${Number(riskMetrics.portfolioSharpe).toFixed(2)}`
        : '—',
    },
    { label: 'Risk Profile', value: riskLabel },
  ]

  const columnWidth = CONTENT_WIDTH / 3
  const rowHeight = 18

  fields.forEach((field, index) => {
    const column = index % 3
    if (column === 0 && index > 0) cursorY += rowHeight * 2

    const x = PAGE_MARGIN + column * columnWidth

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(field.label.toUpperCase(), x, cursorY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...INK_DARK)
    doc.text(field.value, x, cursorY + 12)
  })

  cursorY += rowHeight * 2 + 6

  // Build row data
  const rows = (portfolioData?.positions ?? []).map((pos) => {
    const detail = detailedPositions.find((dd) => dd.symbol === pos.symbol)
    const riskSym = riskMetrics?.perSymbol?.find(
      (ps) => ps.symbol === pos.symbol,
    )
    return {
      symbol: pos.symbol,
      sector: detail?.sector || pos.sector || '—',
      quantity: pos.quantity,
      entryPrice: pos.avg_entry_price,
      currentPrice: pos.currentPrice,
      marketValue: pos.currentValue,
      unrealizedPnL: pos.unrealizedPnL,
      roiPercent: pos.unrealizedPnLPercent,
      marketDecision: detail?.marketDecision ?? '—',
      portfolioDecision: detail?.portfolioDecision ?? '—',
      confidence: detail?.confidence ?? null,
      riskLevel: detail?.riskLevel ?? '—',
      beta: riskSym?.beta ?? detail?.beta ?? null,
      sharpe: riskSym?.sharpe ?? detail?.sharpe ?? null,
      reasoningSummary: detail?.reasoning?.summary ?? '',
      riskFlags: detail?.reasoning?.details ?? [],
      positionExposurePercent: detail?.exposure?.positionPercent ?? null,
      sectorExposurePercent: detail?.exposure?.sectorPercent ?? null,
      overExposed: detail?.exposure?.isOverExposed ?? false,
      strategy: detail?.actionGuidance?.positionStrategy ?? null,
      holdDuration: detail?.actionGuidance?.holdDuration ?? '',
      takeProfitZone: detail?.actionGuidance?.takeProfitZone ?? '',
      stopLossZone: detail?.actionGuidance?.stopLossZone ?? '',
      watchFor: detail?.actionGuidance?.watchFor ?? [],
    }
  })

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
  }

  const tableEnd = (fallback: number): number => {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY
    return (finalY ?? fallback + 40) + 22
  }

  // 1. Holdings Table
  cursorY = drawSecTitle('Holdings & Performance', cursorY)
  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [
      [
        'Symbol',
        'Sector',
        'Qty',
        'Entry',
        'Current',
        'Market Value',
        'Unrealized P&L',
        'ROI %',
        'Beta',
        'Sharpe',
      ],
    ],
    body: rows.map((row) => [
      row.symbol,
      row.sector,
      String(row.quantity),
      formatCurrency(row.entryPrice),
      formatCurrency(row.currentPrice),
      formatCurrency(row.marketValue),
      formatSignedCurrency(row.unrealizedPnL),
      `${Number(row.roiPercent || 0).toFixed(2)}%`,
      row.beta != null ? Number(row.beta).toFixed(2) : '1.00',
      row.sharpe != null ? Number(row.sharpe).toFixed(2) : '—',
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
      if (
        data.section !== 'body' ||
        (data.column.index !== 6 && data.column.index !== 7)
      )
        return
      const row = rows[data.row.index]
      const positive =
        data.column.index === 6 ? row.unrealizedPnL >= 0 : row.roiPercent >= 0
      data.cell.styles.textColor = positive ? POSITIVE_GREEN : NEGATIVE_RED
      data.cell.styles.fontStyle = 'bold'
    },
  })
  cursorY = tableEnd(cursorY)

  // 2. Decisions Table
  cursorY = drawSecTitle('AI Decisions & Risk', cursorY)
  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [
      [
        'Symbol',
        'Market Signal',
        'Portfolio Action',
        'Confidence',
        'Risk',
        'Position %',
        'Sector %',
        'Over-Exposed',
      ],
    ],
    body: rows.map((row) => [
      row.symbol,
      row.marketDecision,
      row.portfolioDecision,
      row.confidence != null ? `${(row.confidence * 100).toFixed(0)}%` : '—',
      row.riskLevel,
      row.positionExposurePercent != null
        ? `${Number(row.positionExposurePercent).toFixed(2)}%`
        : '—',
      row.sectorExposurePercent != null
        ? `${Number(row.sectorExposurePercent).toFixed(2)}%`
        : '—',
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
      if (data.section !== 'body') return
      const rawText = typeof data.cell.raw === 'string' ? data.cell.raw : ''
      const colorKey = [1, 2, 4].includes(data.column.index) ? rawText : null
      const color = colorKey ? DECISION_COLORS[colorKey] : undefined
      if (color) {
        data.cell.styles.textColor = color
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === 7 && rawText === 'YES') {
        data.cell.styles.textColor = NEGATIVE_RED
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  cursorY = tableEnd(cursorY)

  // 3. Action Guidance Table
  cursorY = drawSecTitle('Action Guidance', cursorY)
  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [
      [
        'Symbol',
        'Strategy',
        'Hold Duration',
        'Take Profit',
        'Stop Loss',
        'Watch For',
      ],
    ],
    body: rows.map((row) => {
      let stratStr = '—'
      if (row.strategy) {
        const enabled = Object.entries(row.strategy)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key.toUpperCase())
        if (enabled.length > 0) stratStr = enabled.join(' / ')
      }
      return [
        row.symbol,
        stratStr,
        row.holdDuration || '—',
        row.takeProfitZone ? `$${row.takeProfitZone}` : '—',
        row.stopLossZone ? `$${row.stopLossZone}` : '—',
        row.watchFor.length > 0 ? row.watchFor.join('; ') : '—',
      ]
    }),
    columnStyles: {
      3: { halign: 'right', cellWidth: 62 },
      4: { halign: 'right', cellWidth: 62 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index === 3) data.cell.styles.textColor = POSITIVE_GREEN
      if (data.column.index === 4) data.cell.styles.textColor = NEGATIVE_RED
    },
  })
  cursorY = tableEnd(cursorY)

  // 4. Reasoning Table
  cursorY = drawSecTitle('AI Reasoning', cursorY)
  autoTable(doc, {
    ...tableStyles,
    startY: cursorY,
    head: [['Symbol', 'Analysis & Risk Flags']],
    body: rows.map((row) => [
      row.symbol,
      [
        row.reasoningSummary,
        row.riskFlags.length > 0
          ? `Risk flags: ${row.riskFlags.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ]),
    styles: { ...tableStyles.styles, fontSize: 8, valign: 'top' as const },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
    },
  })
  cursorY = tableEnd(cursorY)

  if (cursorY + 90 > PAGE_HEIGHT - PAGE_MARGIN) {
    doc.addPage()
    cursorY = PAGE_MARGIN
  }

  // Disclaimer
  const lines = doc.splitTextToSize(PORTFOLIO_DISCLAIMER, CONTENT_WIDTH)
  const boxHeight = lines.length * 11 + 24

  doc.setFillColor(243, 244, 246)
  doc.roundedRect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, boxHeight, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...INK_DARK)
  doc.text('IMPORTANT NOTICE', PAGE_MARGIN + 10, cursorY + 14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text(lines, PAGE_MARGIN + 10, cursorY + 26)

  // Page footers
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`Page ${page} of ${pageCount}`, PAGE_MARGIN, PAGE_HEIGHT - 24)
    doc.text(
      'StockPros AI — Portfolio Health Report',
      PAGE_WIDTH - PAGE_MARGIN,
      PAGE_HEIGHT - 24,
      {
        align: 'right',
      },
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}
