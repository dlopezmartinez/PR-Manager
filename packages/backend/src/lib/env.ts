import { z } from 'zod';
import logger from './logger.js';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),

  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),

  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_VARIANT_MONTHLY: z.string().optional(),
  LEMONSQUEEZY_VARIANT_YEARLY: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  SENTRY_ENABLED: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),

  FRONTEND_URL: z.string().optional(),
  API_BASE_URL: z.string().optional(),
  APP_URL: z.string().optional(),

  ADMIN_SECRET_KEY: z.string().optional(),

  DOWNLOAD_SIGNING_SECRET: z.string().optional(),

  LOG_LEVEL: z.string().optional(),
  LOGS_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    logger.error('Invalid environment variables', { errors });

    for (const [field, messages] of Object.entries(errors)) {
      logger.error(`Environment variable error: ${field}`, { messages });
    }

    process.exit(1);
  }

  logger.info('Environment variables validated successfully');
  return result.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}
