import { readEnv, EnvSchema, EnvSchemaType } from './EnvSchema';

let cachedEnv: EnvSchemaType | null = null;

export function env(): EnvSchemaType {
  if (cachedEnv) return cachedEnv;
  if (process.env.NODE_ENV === 'test') {
    // Tests set env via injectEnv() before first call
    return readEnv(EnvSchema) as EnvSchemaType;
  }
  cachedEnv = readEnv(EnvSchema);
  return cachedEnv;
}

/**
 * In-memory env override for tests. Call BEFORE env() is first read.
 * Returns a cleanup function to restore the original env.
 */
export function injectEnv(partial: Partial<EnvSchemaType>) {
  const snapshot = readEnv(EnvSchema);
  Object.assign(process.env, partial);
  cachedEnv = null;
  return () => {
    Object.assign(process.env, snapshot);
    cachedEnv = null;
  };
}
