// ============================================
// Config — Validated environment variables
// ============================================

import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(10),
  REDIS_URL: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().min(10),
  // Model id for ALL Anthropic calls. A retired model id → API 404 → 502 in
  // every LLM flow, so the model is config, never hardcoded: the next model
  // retirement is a one-line env change, not an outage. The default is a
  // current, valid model so prod self-heals on redeploy even if the Vercel var
  // is unset. Low-latency/cost alternative for the tight serverless budgets:
  // ANTHROPIC_MODEL=claude-haiku-4-5-20251001
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RECIPE_SEARCH_LIMIT_PER_HOUR: z.coerce.number().default(10),
  RECIPE_SEARCH_LIMIT_PER_HOUR_PREMIUM: z.coerce.number().default(100),
  RESEND_API_KEY: z.string().min(5),
  EMAIL_FROM: z.string().default('Nisse <noreply@matkompass.se>'),
  // Social auth (optional — set to enable)
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  APPLE_CLIENT_ID: z.string().optional().default(''),
  APPLE_TEAM_ID: z.string().optional().default(''),
  APPLE_KEY_ID: z.string().optional().default(''),
  APPLE_PRIVATE_KEY: z.string().optional().default(''),
  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
