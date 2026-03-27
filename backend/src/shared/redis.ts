import IORedis from 'ioredis';

const DEBUG_REDIS = process.env.DEBUG_REDIS === 'true';

export const redisRetryStrategy = DEBUG_REDIS ? undefined : () => null;

export const buildRedisUrl = (): string => {
  const rawUrl = process.env.REDIS_URL?.trim();
  if (rawUrl) return rawUrl;

  const host = (process.env.REDIS_HOST || 'localhost').trim();
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD ? encodeURIComponent(process.env.REDIS_PASSWORD) : '';
  const auth = password ? `:${password}@` : '';
  return `redis://${auth}${host}:${port}`;
};

export const createRedisClient = (options: IORedis.RedisOptions = {}) =>
  new (IORedis as any)(buildRedisUrl(), {
    maxRetriesPerRequest: null,
    retryStrategy: redisRetryStrategy,
    lazyConnect: true,
    ...options,
  });
