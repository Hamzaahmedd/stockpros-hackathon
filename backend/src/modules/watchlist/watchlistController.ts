import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
import { AlertType } from '@prisma/client'
import * as WatchlistService from './service'
import { WatchlistItemResponse } from './types'
import { getUserId } from '../../shared/utils'

export interface WatchlistDataResponse<T> {
  success: boolean
  message: string
  data?: T
}

export interface AddToWatchlistBody {
  symbol: string
  targetEntryPrice?: number
  stopLoss?: number
  notes?: string
}

export interface UpdateWatchlistBody {
  targetEntryPrice?: number
  stopLoss?: number
  notes?: string
}

export interface ConvertToPositionBody {
  entryPrice?: number
  quantity?: number
}

export interface CreateAlertBody {
  type: AlertType
  threshold?: number
}

export interface UpdateAlertBody {
  threshold?: number
  isActive?: boolean
}

@Tags('Watchlist')
@Route('api/v1/watchlist')
export class WatchlistController extends Controller {
  /**
   * Get all watchlist items for the authenticated user with real-time pricing and AI zones.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getWatchlist(
    @Request() req: ExpressRequest,
  ): Promise<WatchlistDataResponse<WatchlistItemResponse[]>> {
    const userId = getUserId(req)
    const items = await WatchlistService.getWatchlist(userId)
    return {
      success: true,
      message: 'Watchlist retrieved successfully',
      data: items,
    }
  }

  /**
   * Add a stock symbol to user's watchlist.
   */
  @Post('')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Created')
  public async addToWatchlist(
    @Request() req: ExpressRequest,
    @Body() body: AddToWatchlistBody,
  ): Promise<WatchlistDataResponse<WatchlistItemResponse>> {
    const userId = getUserId(req)
    const upperSymbol = body.symbol.toUpperCase()
    const item = await WatchlistService.addToWatchlist(userId, {
      ...body,
      symbol: upperSymbol,
    })
    this.setStatus(201)
    return {
      success: true,
      message: `${upperSymbol} added to watchlist`,
      data: item,
    }
  }

  /**
   * Update target prices or notes for a watchlist entry.
   */
  @Patch('{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async updateWatchlistEntry(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Body() body: UpdateWatchlistBody,
  ): Promise<WatchlistDataResponse<WatchlistItemResponse>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const updated = await WatchlistService.updateWatchlistEntry(
      userId,
      upperSymbol,
      body,
    )
    return {
      success: true,
      message: `${upperSymbol} entry updated`,
      data: updated,
    }
  }

  /**
   * Remove a stock from user's watchlist.
   */
  @Delete('{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async removeFromWatchlist(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
  ): Promise<WatchlistDataResponse<void>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    await WatchlistService.removeFromWatchlist(userId, upperSymbol)
    return {
      success: true,
      message: `${upperSymbol} removed from watchlist`,
    }
  }

  /**
   * Convert a watchlist entry to a portfolio position.
   */
  @Post('{symbol}/convert-to-position')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Created')
  public async convertToPosition(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Body() body: ConvertToPositionBody,
  ): Promise<WatchlistDataResponse<any>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const position = await WatchlistService.convertToPosition(
      userId,
      upperSymbol,
      body,
    )
    this.setStatus(201)
    return {
      success: true,
      message: `${upperSymbol} converted to portfolio position`,
      data: position,
    }
  }

  /**
   * Get all active alerts for a watchlist symbol.
   */
  @Get('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getAlerts(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
  ): Promise<WatchlistDataResponse<any>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const alerts = await WatchlistService.getAlerts(userId, upperSymbol)
    return {
      success: true,
      message: 'Alerts retrieved successfully',
      data: alerts,
    }
  }

  /**
   * Create an alert rule for a watchlist symbol.
   */
  @Post('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Created')
  public async createAlert(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Body() body: CreateAlertBody,
  ): Promise<WatchlistDataResponse<any>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const alert = await WatchlistService.createAlert(userId, upperSymbol, body)
    this.setStatus(201)
    return {
      success: true,
      message: `Alert set for ${upperSymbol}`,
      data: alert,
    }
  }

  /**
   * Update an alert rule.
   */
  @Patch('{symbol}/alerts/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async updateAlert(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Path() id: string,
    @Body() body: UpdateAlertBody,
  ): Promise<WatchlistDataResponse<any>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const updated = await WatchlistService.updateAlert(
      userId,
      upperSymbol,
      id,
      body,
    )
    return {
      success: true,
      message: `Alert for ${upperSymbol} updated`,
      data: updated,
    }
  }

  /**
   * Delete an alert rule.
   */
  @Delete('{symbol}/alerts/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async deleteAlert(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Path() id: string,
  ): Promise<WatchlistDataResponse<void>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    await WatchlistService.deleteAlert(userId, upperSymbol, id)
    return {
      success: true,
      message: 'Alert deleted successfully',
    }
  }
}
