import { RedisOptions } from "ioredis";
import config from "./env";

const redisUrl = config.redis.url;

const baseOpts: RedisOptions = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 15000,
  commandTimeout: 5000,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error(`Redis retry limit reached after ${times} attempts`);
      return null;
    }
    const delay = Math.min(times * 2000, 5000);
    console.log(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
};

let isTLS = false;
if (redisUrl) {
  try {
    const u = new URL(redisUrl);
    isTLS = u.protocol === "rediss:";
  } catch (e) {
    console.warn("Warning: Invalid REDIS_URL format. TLS may not be configured correctly.");
  }
}

export const finalOpts: RedisOptions = {
  ...baseOpts,
  tls: isTLS
    ? {
      rejectUnauthorized:
        config.redis.tlsRejectUnauthorized ?? false, // false for Production
    }
    : undefined,
  family: 4,
  enableReadyCheck: false,
  showFriendlyErrorStack: true,
};