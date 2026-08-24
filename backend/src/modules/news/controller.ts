import { Response, NextFunction } from 'express';
import { validateOrThrow } from '../../shared/errors';
import * as NewsService from './service';
import {
  newsFeedValidator, NewsFeedQuery,
  newsSymbolValidator, NewsSymbolQuery,
  newsSearchValidator, NewsSearchQuery,
  newsSavedValidator, NewsSavedQuery, articleIdsValidator,
} from './validation';
import { AuthenticatedRequest } from '../auth';
import { getUserId, sendSuccess } from '../../shared/utils';

export const getNewsFeed = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const query: NewsFeedQuery = validateOrThrow(newsFeedValidator, req.query);
    const result = await NewsService.getNewsFeed(userId, query);
    sendSuccess(res, {
      message: 'News feed retrieved successfully',
      extra: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getNewsBySymbol = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const symbol = (req.params.symbol as string).toUpperCase();
    const query: NewsSymbolQuery = validateOrThrow(newsSymbolValidator, req.query);
    const result = await NewsService.getNewsBySymbol(userId, symbol, query);
    sendSuccess(res, {
      message: `News for ${symbol} retrieved successfully`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const searchNews = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const query: NewsSearchQuery = validateOrThrow(newsSearchValidator, req.query);
    const result = await NewsService.searchNews(userId, query);
    sendSuccess(res, {
      message: 'News search completed successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getNewsSummary = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const result = await NewsService.getNewsSummary(userId);
    sendSuccess(res, {
      message: 'News summary retrieved successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getSavedNews = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const query: NewsSavedQuery = validateOrThrow(newsSavedValidator, req.query);
    const result = await NewsService.getSavedNews(userId, query);
    sendSuccess(res, {
      message: 'Saved news retrieved successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const result = await NewsService.markArticleAsRead(userId, req.params.id as string);
    sendSuccess(res, {
      message: 'Article marked as read',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const markMultipleAsRead = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { articleIds } = validateOrThrow(articleIdsValidator, req.body);
    const result = await NewsService.markMultipleArticlesAsRead(userId, articleIds);
    sendSuccess(res, {
      message: 'Articles marked as read',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const markAllAsRead = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const result = await NewsService.markAllArticlesAsRead(userId);
    sendSuccess(res, {
      message: 'All articles marked as read',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const saveArticle = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const result = await NewsService.saveArticle(userId, req.params.id as string);
    sendSuccess(res, {
      message: 'Article saved',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const unsaveArticle = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    await NewsService.unsaveArticle(userId, req.params.id as string);
    sendSuccess(res, {
      message: 'Article removed from saved',
    });
  } catch (err) {
    next(err);
  }
};
