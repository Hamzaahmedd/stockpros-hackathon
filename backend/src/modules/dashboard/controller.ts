import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../auth';
import { getUserId, sendSuccess } from '../../shared/utils';
import { getDashboard } from './service';

export const getDashboardData = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const data = await getDashboard(userId);
    sendSuccess(res, {
      message: 'Dashboard data retrieved successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};
