import {
  Controller,
  Get,
  Route,
  Tags,
  Security,
  Request,
  SuccessResponse,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
import { getDashboard } from './service'
import { DashboardResponse } from './types'
import { getUserId } from '../../shared/utils'

export interface GetDashboardApiResponse {
  success: boolean
  message: string
  data: DashboardResponse
}

@Tags('Dashboard')
@Route('api/v1/dashboard')
export class DashboardController extends Controller {
  /**
   * Get personalized user dashboard briefing, portfolio metrics, smart triggers, and market insights.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getDashboardData(
    @Request() req: ExpressRequest,
  ): Promise<GetDashboardApiResponse> {
    const userId = getUserId(req)
    const data = await getDashboard(userId)
    return {
      success: true,
      message: 'Dashboard data retrieved successfully',
      data,
    }
  }
}
