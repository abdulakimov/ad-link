import { z } from 'zod';

/** Validated environment — the app fails fast on boot if anything is missing/invalid. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_SECRET: z.string().min(16, 'APP_SECRET must be at least 16 chars'),
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 bytes (chars)'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  SENTRY_DSN: z.string().optional(),
  // social login (optional — each provider self-disables if unset)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}`,
    );
  }
  return parsed.data;
}
