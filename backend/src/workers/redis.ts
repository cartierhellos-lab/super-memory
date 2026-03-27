import { createRedisClient, redisRetryStrategy } from '../shared/redis.js';

export const redisConnection = createRedisClient({
  maxRetriesPerRequest: null,
  retryStrategy: redisRetryStrategy,
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  if (process.env.DEBUG_REDIS === 'true') {
    console.error('Redis connection error:', err);
  }
});
