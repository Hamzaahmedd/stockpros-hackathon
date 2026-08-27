// src/shared/utils/preloader.ts
import api from '@/shared/api/axios';

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
}

class PreloaderService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 60 * 1000; // 1 minute TTL
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly defaultDebounceMs = 75; // 75ms intent delay to avoid accidental cursor pass-bys

  private getCacheKey(url: string, params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) return url;
    const query = new URLSearchParams(params).toString();
    return `${url}?${query}`;
  }

  /**
   * Proactively prefetch data for an API endpoint without blocking.
   * If already cached and fresh or currently in-flight, reuse existing.
   */
  public preload<T = any>(url: string, params?: Record<string, any>, ttl = this.defaultTTL): Promise<T> {
    const key = this.getCacheKey(url, params);
    const existing = this.cache.get(key);
    const now = Date.now();

    if (existing) {
      if (existing.promise) {
        return existing.promise;
      }
      if (now - existing.timestamp < ttl) {
        return Promise.resolve(existing.data);
      }
    }

    const promise = api
      .get(url, { params })
      .then((res) => {
        const data = res.data;
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .catch((err) => {
        this.cache.delete(key);
        throw err;
      });

    this.cache.set(key, { data: null as any, timestamp: now, promise });
    return promise;
  }

  /**
   * Preload with intent debouncing (default 75ms).
   * Useful for mouse hover events so accidental cursor pass-bys don't fire requests.
   */
  public preloadDebounced<T = any>(
    url: string,
    params?: Record<string, any>,
    delayMs = this.defaultDebounceMs,
    ttl = this.defaultTTL
  ): void {
    const key = this.getCacheKey(url, params);
    this.cancelDebounce(key);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.preload<T>(url, params, ttl).catch(() => {});
    }, delayMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Cancel any pending debounced preloads for a specific key or route.
   */
  public cancelDebounce(key: string): void {
    const timer = this.debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
  }

  /**
   * Get cached data if fresh, or fetch and cache.
   */
  public async get<T = any>(url: string, params?: Record<string, any>, ttl = this.defaultTTL): Promise<T> {
    const key = this.getCacheKey(url, params);
    this.cancelDebounce(key);
    const existing = this.cache.get(key);
    const now = Date.now();

    if (existing) {
      if (existing.promise) {
        return existing.promise;
      }
      if (now - existing.timestamp < ttl && existing.data) {
        return existing.data;
      }
    }

    return this.preload<T>(url, params, ttl);
  }

  /**
   * Invalidate specific cache key or any key matching a prefix.
   */
  public invalidate(urlPrefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(urlPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache and pending timers.
   */
  public clear(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.cache.clear();
  }

  /**
   * Optimistically preload data associated with a specific route when a user
   * hovers or focuses on a navigation item (debounced by default).
   */
  public preloadRoute(route: string, debounceMs = this.defaultDebounceMs): void {
    const timerKey = `route:${route}`;
    this.cancelDebounce(timerKey);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(timerKey);
      try {
        const cleanRoute = route.split('?')[0].replace(/\/$/, '');

        switch (cleanRoute) {
          case '/dashboard':
            this.preload('/api/v1/dashboard');
            this.preload('/api/v1/market/top-stocks');
            break;
          case '/watchlist':
            this.preload('/api/v1/watchlist');
            break;
          case '/market':
            this.preload('/api/v1/market/top-stocks');
            break;
          case '/forecast':
            this.preload('/api/v1/forecast', { symbol: 'AAPL', period: '1w' });
            break;
          case '/news':
            this.preload('/api/v1/news/feed', { limit: 20 });
            this.preload('/api/v1/news/summary');
            break;
          case '/decision-support/market-analysis':
            this.preload('/api/v1/decision-support/market/decision/AAPL');
            break;
          case '/decision-support/portfolio-health':
            this.preload('/api/v1/decision-support/portfolio/latest');
            break;
          case '/access-control/users':
            this.preload('/api/v1/rbac/users');
            break;
          case '/access-control/roles':
            this.preload('/api/v1/rbac/roles');
            this.preload('/api/v1/rbac/permissions');
            break;
          case '/access-control/overview':
            this.preload('/api/v1/rbac/resources');
            break;
          default:
            break;
        }
      } catch {
        // Non-blocking catch
      }
    }, debounceMs);

    this.debounceTimers.set(timerKey, timer);
  }

  /**
   * Cancel debounced preload for a route if the user moves away before intent delay.
   */
  public cancelPreloadRoute(route: string): void {
    this.cancelDebounce(`route:${route}`);
  }
}

export const preloader = new PreloaderService();
