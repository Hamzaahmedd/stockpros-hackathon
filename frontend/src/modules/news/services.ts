// src/services/newsService.ts
import api from '@/shared/api/axios';
import {
  NewsSummary,
  PaginatedNewsResponse,
  NewsFeedParams,
  NewsSearchParams
} from './types';

export const newsService = {
  getFeed: async (params: NewsFeedParams): Promise<PaginatedNewsResponse> => {
    const isSaved = params.filter === 'saved';
    const endpoint = isSaved ? '/api/v1/news/saved' : '/api/v1/news/feed';
    const res = await api.get(endpoint, { params });

    const body = res.data;
    if (!body?.success) return { data: [], nextCursor: null, hasMore: false };

    // The backend is inconsistent:
    // /news/feed returns { data: NewsArticle[], nextCursor, hasMore }
    // /news/saved returns { data: { data: NewsArticle[], nextCursor, hasMore } }

    if (isSaved) {
        return body.data || { data: [], nextCursor: null, hasMore: false };
    }

    // /news/feed case
    return {
        data: body.data || [],
        nextCursor: body.nextCursor || null,
        hasMore: body.hasMore || false
    };
  },

  getSymbolNews: async (symbol: string, limit: number = 20, cursor?: string): Promise<PaginatedNewsResponse> => {
    const res = await api.get(`/api/v1/news/symbol/${symbol}`, {
        params: { limit, cursor }
    });
    // { success: true, data: { data: [...], ... } }
    return res.data?.data || { data: [], nextCursor: null, hasMore: false };
  },

  search: async (params: NewsSearchParams): Promise<PaginatedNewsResponse> => {
    const res = await api.get('/api/v1/news/search', { params });
    // { success: true, data: { data: [...], ... } }
    return res.data?.data || { data: [], nextCursor: null, hasMore: false };
  },

  getSummary: async (): Promise<NewsSummary> => {
    const res = await api.get('/api/v1/news/summary');
    return res.data?.data || { portfolioNews: [], watchlistNews: [], marketHeadlines: [], unreadCount: 0 };
  },

  getSaved: async (limit: number = 20, cursor?: string): Promise<PaginatedNewsResponse> => {
    return newsService.getFeed({ filter: 'saved', limit, cursor });
  },

  markRead: async (id: string): Promise<void> => {
    await api.patch(`/api/v1/news/${id}/read`);
  },

  markMultipleRead: async (articleIds: string[]): Promise<void> => {
    await api.patch('/api/v1/news/read-multiple', { articleIds });
  },

  markAllRead: async (): Promise<void> => {
    await api.patch('/api/v1/news/read-all');
  },

  saveArticle: async (id: string): Promise<boolean> => {
    const res = await api.post(`/api/v1/news/${id}/save`);
    return res.data?.success || false;
  },

  unsaveArticle: async (id: string): Promise<boolean> => {
    const res = await api.delete(`/api/v1/news/${id}/save`);
    return res.data?.success || false;
  }
};
