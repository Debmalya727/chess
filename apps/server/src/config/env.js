import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_key_12345',
  nodeEnv: process.env.NODE_ENV || 'development',
  ratingInitial: parseInt(process.env.RATING_INITIAL || '1500', 10),
  ratingKFactor: parseInt(process.env.RATING_K_FACTOR || '32', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chess_platform',
    ssl: process.env.DB_SSL === 'false' ? undefined : (
      process.env.DB_SSL === 'true' || (process.env.DB_HOST && !['localhost', '127.0.0.1'].includes(process.env.DB_HOST))
        ? (process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true } : { minVersion: 'TLSv1.2', rejectUnauthorized: true })
        : undefined
    )
  }
};
