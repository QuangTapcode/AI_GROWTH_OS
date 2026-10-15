import { z } from 'zod';

/**
 * W1 worker env schema for pg-boss baseline
 * Mirrors apps/api/.env.example conventions
 */

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['local', 'development', 'production', 'test']).default('local'),
  PORT: z.coerce.number().default(4000),
  PG_HOST: z.string().default('127.0.0.1'),
  PG_PORT: z.coerce.number().default(15432),
  PG_USER: z.string().default('ai_growth_dev'),
  PG_DATABASE: z.string().default('ai_growth_os'),
  PG_PASSWORD: z.string().default(''),
  PG_MAX: z.coerce.number().default(10),
  QUEUE_HOST: z.string().default('127.0.0.1'),
  QUEUE_PORT: z.coerce.number().default(5432),
  QUEUE_DATABASE: z.string().default('ai_growth_os'),
  QUEUE_USER: z.string().default('ai_growth_dev'),
  QUEUE_PASSWORD: z.string().default(''),
  QUEUE_NAME: z.string().default('ai-growth-os-queue'),
  // Worker caps (W1-PM-02)
  AI_CONCURRENCY: z.coerce.number().min(1).max(4).default(1),
  MAX_PROVIDER_CALLS_PER_JOB: z.coerce.number().default(2),
  JOB_EXECUTION_TIMEOUT_MS: z.coerce.number().default(600_000),
  // Heartbeat/lease + durable job state (W1-MY-01)
  HEARTBEAT_INTERVAL_MS: z.coerce.number().default(5_000),
  HEARTBEAT_TTL_MS: z.coerce.number().default(30_000),
  WORKER_STATE_DIR: z.string().default('.worker-state'),
  // Integration mode (fake adapters for local)
  INTEGRATION_MODE: z.enum(['fake', 'production']).default('fake'),
  AI_PROVIDER_MODE: z.enum(['fake', 'live']).default('fake'),
});

export type EnvSchemaType = z.infer<typeof EnvSchema>;

/**
 * Safe getters so tests can override env before importing modules
 */
export function readEnv(schema: z.ZodType<EnvSchemaType> = EnvSchema) {
  return schema.parse(process.env);
}
