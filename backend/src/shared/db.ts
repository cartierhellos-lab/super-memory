import fs from 'fs';
import mysql from 'mysql2/promise';

const readEnvOrFile = (key: string, fileKey: string): string | undefined => {
  const direct = process.env[key];
  if (direct && direct.trim()) return direct.trim();
  const filePath = process.env[fileKey];
  if (filePath && filePath.trim()) {
    return fs.readFileSync(filePath.trim(), 'utf8');
  }
  return undefined;
};

const sslEnabled = String(process.env.DB_SSL || '').trim().toLowerCase() === 'true';
const sslRejectUnauthorized =
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() === 'false'
    ? false
    : true;
const sslOptions = sslEnabled
  ? {
      rejectUnauthorized: sslRejectUnauthorized,
      ca: readEnvOrFile('DB_SSL_CA', 'DB_SSL_CA_FILE'),
      cert: readEnvOrFile('DB_SSL_CERT', 'DB_SSL_CERT_FILE'),
      key: readEnvOrFile('DB_SSL_KEY', 'DB_SSL_KEY_FILE'),
    }
  : undefined;
const sanitizedSsl =
  sslOptions &&
  Object.fromEntries(Object.entries(sslOptions).filter(([, value]) => value !== undefined));

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'massmail',
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_NAME || 'massmail',
  waitForConnections: true,
  connectionLimit: 50, // Increased from 10 to handle more concurrent requests
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  namedPlaceholders: true,
  // Timeouts to prevent hanging connections
  connectTimeout: 10000, // 10s
  ssl: sslEnabled ? sanitizedSsl : undefined,
});
