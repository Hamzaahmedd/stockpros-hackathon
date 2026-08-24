import type { Request, Response, NextFunction } from 'express';
import * as WatchlistService from './service';
import {
  addToWatchlistValidator,
  convertToPositionValidator,
  createAlertValidator,
  updateWatchlistValidator,
  updateAlertValidator,
} from './validation';
import { getUserId, sendSuccess } from '../../shared/utils';
import { validateOrThrow } from '../../shared/errors';

export const addToWatchlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const validatedData = validateOrThrow(addToWatchlistValidator, req.body);
    const item = await WatchlistService.addToWatchlist(userId, validatedData);

    sendSuccess(res, {
      statusCode: 201,
      message: `${validatedData.symbol.toUpperCase()} added to watchlist`,
      data: item,
    });
  } catch (err) {
    next(err);
  }
};

export const convertToPosition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;

    const validatedData = validateOrThrow(convertToPositionValidator, req.body);
    const position = await WatchlistService.convertToPosition(userId, symbol, validatedData);

    sendSuccess(res, {
      statusCode: 201,
      message: `${symbol.toUpperCase()} converted to portfolio position`,
      data: position,
    });
  } catch (err) {
    next(err);
  }
};

export const createAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;
    const validatedData = validateOrThrow(createAlertValidator, req.body);

    const alert = await WatchlistService.createAlert(userId, symbol, validatedData);

    sendSuccess(res, {
      statusCode: 201,
      message: `Alert set for ${symbol.toUpperCase()}`,
      data: alert,
    });
  } catch (err) {
    next(err);
  }
};

export const getWatchlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const items = await WatchlistService.getWatchlist(userId);

    sendSuccess(res, {
      message: 'Watchlist retrieved successfully',
      data: items,
    });
  } catch (err) {
    next(err);
  }
};

export const getAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;

    const alerts = await WatchlistService.getAlerts(userId, symbol);

    sendSuccess(res, {
      message: 'Alerts retrieved successfully',
      data: alerts,
    });
  } catch (err) {
    next(err);
  }
};

export const updateWatchlistEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;
    const validatedData = validateOrThrow(updateWatchlistValidator, req.body);

    const updated = await WatchlistService.updateWatchlistEntry(userId, symbol, validatedData);

    sendSuccess(res, {
      message: `${symbol.toUpperCase()} entry updated`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const updateAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;
    const id = req.params.id as string;
    const validatedData = validateOrThrow(updateAlertValidator, req.body);

    const updated = await WatchlistService.updateAlert(userId, symbol, id, validatedData);

    sendSuccess(res, {
      message: `Alert for ${symbol.toUpperCase()} updated`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const removeFromWatchlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;

    await WatchlistService.removeFromWatchlist(userId, symbol);

    sendSuccess(res, {
      message: `${symbol.toUpperCase()} removed from watchlist`,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = req.params.symbol as string;
    const id = req.params.id as string;

    await WatchlistService.deleteAlert(userId, symbol, id);

    sendSuccess(res, {
      message: 'Alert deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
