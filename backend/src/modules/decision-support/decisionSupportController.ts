import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
  UploadedFile,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
import {
  getLatestPortfolioForUser,
  getMarketDecisionResponse,
  getPortfolioDecisionResponse,
  uploadPortfolio,
} from './service'
import { getUserId } from '../../shared/utils'

export interface DecisionResponse<T = any> {
  success: boolean
  message: string
  data: T
}

export interface PortfolioDecisionRequestBody {
  portfolioId: string
  decisionMode: 'OVERVIEW' | 'DETAILED'
  symbol?: string
}

@Tags('Decision Support')
@Route('api/v1/decision-support')
export class DecisionSupportController extends Controller {
  /**
   * Get comprehensive AI market-based trade decision, sentiment, and action guidance for a stock symbol.
   */
  @Get('market/decision/{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getMarketBasedTradeDecision(
    @Path() symbol: string,
  ): Promise<DecisionResponse<any>> {
    const uppercaseSymbol = symbol.toUpperCase()
    const data = await getMarketDecisionResponse(uppercaseSymbol)
    return {
      success: true,
      message: 'Trade decision retrieved successfully.',
      data,
    }
  }

  /**
   * Upload CSV or Excel file containing trader portfolio holdings.
   */
  @Post('upload-portfolio')
  @Security('bearerAuth', ['PORTFOLIO:CREATE'])
  @SuccessResponse(200, 'Success')
  public async uploadTraderPortfolio(
    @Request() req: ExpressRequest,
    @UploadedFile('portfolio') file?: Express.Multer.File,
  ): Promise<DecisionResponse<any>> {
    const uploadedFile = file || (req as any).file
    const fileType = uploadedFile?.mimetype
    const buffer = uploadedFile?.buffer
    const userId = getUserId(req)

    const data = await uploadPortfolio(fileType, buffer, userId)
    return {
      success: true,
      message: 'Portfolio uploaded successfully.',
      data,
    }
  }

  /**
   * Run multi-position AI decision analysis against an uploaded portfolio.
   */
  @Post('portfolio/decision')
  @Security('bearerAuth', ['PORTFOLIO:CREATE'])
  @SuccessResponse(200, 'Success')
  public async getPortfolioBasedTradeDecision(
    @Request() req: ExpressRequest,
    @Body() body: PortfolioDecisionRequestBody,
  ): Promise<DecisionResponse<any>> {
    const userId = getUserId(req)
    const data = await getPortfolioDecisionResponse(
      userId,
      body.portfolioId,
      body.decisionMode,
    )
    return {
      success: true,
      message: `${body.decisionMode} decisions generated successfully.`,
      data,
    }
  }

  /**
   * Get user's latest uploaded portfolio snapshot with real-time valuation.
   */
  @Get('portfolio/latest')
  @Security('bearerAuth', ['PORTFOLIO:READ'])
  @SuccessResponse(200, 'Success')
  public async getLatestPortfolio(
    @Request() req: ExpressRequest,
  ): Promise<DecisionResponse<any>> {
    const userId = getUserId(req)
    const portfolio = await getLatestPortfolioForUser(userId)
    return {
      success: true,
      message: 'Latest portfolio retrieved successfully.',
      data: portfolio,
    }
  }
}
