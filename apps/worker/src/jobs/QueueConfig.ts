import PgBoss from 'pg-boss';
import { env } from '../config';

export interface QueueOptions {
  /** Full connection string; nếu thiếu thì dựng từ QUEUE_* env */
  databaseUrl?: string;
  database?: { host?: string; port?: number; user?: string; database?: string; password?: string; max?: number };
}

/**
 * pg-boss v8 queue factory (W1-MY-01).
 * pg-boss tự tạo schema/bảng của nó lúc `start()`; jobs được route theo
 * *job name* (xem QueueJobs), không theo tên instance.
 */
export function createQueue(opts: QueueOptions = {}): PgBoss {
  const config: PgBoss.ConstructorOptions = {
    ...(opts.databaseUrl
      ? { connectionString: opts.databaseUrl }
      : {
          host: opts.database?.host ?? env().QUEUE_HOST,
          port: opts.database?.port ?? env().QUEUE_PORT,
          user: opts.database?.user ?? env().QUEUE_USER,
          database: opts.database?.database ?? env().QUEUE_DATABASE,
          password: opts.database?.password ?? env().QUEUE_PASSWORD,
        }),
    max: opts.database?.max ?? env().PG_MAX,
  };
  return new PgBoss(config);
}

/** Nhãn queue/log theo env (pg-boss v8 không có khái niệm queue name theo instance) */
export function queueName(): string {
  return env().QUEUE_NAME;
}

// Job type name constants for routing in pg-boss
export const QueueJobs = {
  INGEST: 'ingest',
  INGEST_REVOKE: 'ingest-revoke',
  INGEST_DELETE: 'ingest-delete',
  RESEARCH: 'research',
  SCORE: 'score',
  STRATEGY: 'strategy',
  CONTENT: 'content',
  PUBLISH: 'publish',
  METRICS: 'metrics',
  LEAD: 'lead',
  INTEGRATIONS: 'integrations',
} as const;

export type QueueJobName = (typeof QueueJobs)[keyof typeof QueueJobs];
