import api from '@/shared/api/axios';
import { triggerBrowserDownload } from '@/shared/utils/download';
import { ForecastData } from '../types';
import { getReportFileName } from './forecastExport';

export const downloadForecastPdf = async (data: ForecastData): Promise<void> => {
  const response = await api.post('/api/v1/forecast/pdf', data, {
    responseType: 'blob',
  });
  const fileName = getReportFileName(data, 'pdf');
  triggerBrowserDownload(response.data, fileName);
};
