import { Controller, Get, Route, Tags, Security, SuccessResponse } from 'tsoa'
import { ApiResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  portfolio: PortfolioSummary
  market: MarketOverview
  recentActivity: ActivityItem[]
}

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  positions: number
}

export interface MarketOverview {
  topGainers: MarketMover[]
  topLosers: MarketMover[]
  mostActive: MarketMover[]
}

export interface MarketMover {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

export interface ActivityItem {
  type: string
  title: string
  description: string
  timestamp: string
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/dashboard')
@Tags('Dashboard')
export class DashboardController extends Controller {
  /**
   * Get a comprehensive dashboard summary: portfolio metrics, market movers, and recent activity.
   * Combines data from multiple modules for a single-request page load.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Dashboard data returned')
  async getDashboard(): Promise<ApiResponse<DashboardSummary>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get real-time market overview including top gainers, losers, and most active stocks.
   */
  @Get('market-overview')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Market overview returned')
  async getMarketOverview(): Promise<ApiResponse<MarketOverview>> {
    throw new Error('tsoa spec-only')
  }
}
