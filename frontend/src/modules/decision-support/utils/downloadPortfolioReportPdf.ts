import api from '@/shared/api/axios';
import { triggerBrowserDownload } from '@/shared/utils/download';
import type { DetailedDecision, PortfolioData, PortfolioRiskMetrics } from '../types';
import { getReportFileName } from './portfolioReport';

export const downloadPortfolioReportPdf = async (
  portfolioData: PortfolioData,
  detailedPositions: DetailedDecision[],
  riskMetrics?: PortfolioRiskMetrics | null,
): Promise<void> => {
  const response = await api.post(
    '/api/v1/decision-support/portfolio/pdf',
    { portfolioData, detailedPositions, riskMetrics },
    { responseType: 'blob' },
  );
  const fileName = getReportFileName('pdf');
  triggerBrowserDownload(response.data, fileName);
};
