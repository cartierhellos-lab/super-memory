const IS_PROD = process.env.NODE_ENV === 'production';

const isPresent = (value: string | undefined) => Boolean(value && value.trim());

export const validateProductionEnv = (): void => {
  if (!IS_PROD) return;

  const missing: string[] = [];
  const requireKey = (key: string) => {
    if (!isPresent(process.env[key])) missing.push(key);
  };

  requireKey('JWT_SECRET');
  requireKey('ADMIN_PASSWORD_HASH');
  requireKey('DB_HOST');
  requireKey('DB_USER');
  requireKey('DB_PASSWORD');
  requireKey('DB_NAME');
  requireKey('MSG_ENC_KEY');
  requireKey('PROXY_ENC_KEY');

  const hasRedisUrl = isPresent(process.env.REDIS_URL);
  const hasRedisHost = isPresent(process.env.REDIS_HOST);
  if (!hasRedisUrl && !hasRedisHost) {
    missing.push('REDIS_URL or REDIS_HOST');
  }

  if (missing.length > 0) {
    console.error(`[config] Missing required production env: ${missing.join(', ')}`);
    process.exit(1);
  }
};
