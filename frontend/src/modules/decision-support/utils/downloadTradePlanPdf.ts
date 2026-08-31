import api from '@/shared/api/axios';
import { triggerBrowserDownload } from '@/shared/utils/download';
import type { PositionSizeResult, RadarCard } from '../types';

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

export const downloadTradePlanPdf = async (
  plan: TradePlanData | (RadarCard & { sizing?: PositionSizeResult }),
): Promise<void> => {
  const response = await api.post('/api/v1/decision-support/trade-plan/pdf', plan, {
    responseType: 'blob',
  });
  const fileName = `stockpros_trade_plan_${plan.symbol.toUpperCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
  triggerBrowserDownload(response.data, fileName);
};
