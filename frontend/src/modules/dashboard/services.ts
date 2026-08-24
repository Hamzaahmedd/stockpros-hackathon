import api from '@/shared/api/axios';
import { DashboardData } from './types';

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const response = await api.get<{ success: boolean; data: DashboardData }>('/api/v1/dashboard');
  if (!response.data.success) {
    throw new Error('Failed to fetch dashboard data');
  }
  return response.data.data;
};
