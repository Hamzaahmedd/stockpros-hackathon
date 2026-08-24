// src/services/redis-service.ts
import Redis from "ioredis";
import config from "./config/env";
import { finalOpts } from "./config/redis";

let redisClient: Redis | null = null;

export async function connectRedis(): Promise<void> {
  const redisUrl = config.redis.url;

  if (!redisUrl || redisUrl.trim() === "" || redisUrl === "undefined") {
    console.log("No valid REDIS_URL found — Redis caching is disabled.");
    return;
  }

  try {

    redisClient = new Redis(redisUrl, finalOpts);

    redisClient.on("error", (err) =>
      console.error("✗ Redis error:", err?.message || err)
    );
    redisClient.on("end", () => console.warn("Redis: connection closed"));
    redisClient.on("ready", () => console.log("Redis connected successfully."));

    await redisClient.connect();

  } catch (err: any) {
    console.error(
      "Redis initialization failed (app will continue without cache):",
      err?.message || err
    );
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch { }
    }
    redisClient = null;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log("Redis connection closed gracefully.");
    } catch (err) {
      console.warn("Redis close error:", (err as Error)?.message || err);
    } finally {
      redisClient = null;
    }
  }
}

export function getRedisClient(): any {
  // 1. Priority: Return existing client options if available
  if (redisClient) {
    return {
      host: redisClient.options.host,
      port: redisClient.options.port,
      password: redisClient.options.password,
    }
  }

  // 2. Fallback: Parse the REDIS_URL environment variable
  const redisUrl = process.env.REDIS_URL || config.redis.url

  if (redisUrl && redisUrl !== '' && redisUrl !== 'undefined') {
    try {
      const parsed = new URL(redisUrl)
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: decodeURIComponent(parsed.password) || undefined,
        // family: 0, // Add this if you are deploying to Railway/Render
      }
    } catch (err: any) {
      console.error('[Redis] Invalid REDIS_URL format:', err.message)
      return undefined
    }
  }

  return undefined
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T
    } catch (e) {
      return data as unknown as T
    }

  } catch (err) {
    console.warn(`Redis getCache error [${key}]:`, err);
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  if (!redisClient) return;
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);

    if (ttlSeconds)
      await redisClient.set(key, serialized, "EX", ttlSeconds);
    else await redisClient.set(key, serialized);
  } catch (err) {
    console.warn(`Redis setCache error [${key}]:`, err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.warn(`Redis deleteCache error [${key}]:`, err);
  }
}
