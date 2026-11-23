import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { GpuRecoveryScanner } from '../GpuRecoveryScanner';

describe('GpuRecoveryScanner (Prompt 10 Unit Tests)', () => {
  it('instantiates with custom options and default fallbacks', () => {
    const mockPool = {} as Pool;
    const scanner = new GpuRecoveryScanner(mockPool, {
      maxDeliveries: 3,
      offlineAfterSeconds: 45,
      queueTtlSeconds: 300,
      offlinePolicy: 'reject',
      maxAgeSeconds: 1800,
    });
    expect(scanner).toBeDefined();
  });

  it('runOnce executes Rule 1 (expired leases & poison jobs), Rule 2 (stale workers), Rule 3 (TTL & maxAge)', async () => {
    const executedQueries: Array<{ sql: string; params?: any[] }> = [];

    const mockClient = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        executedQueries.push({ sql: sql.trim(), params });

        // Rule 1 query: expired jobs
        if (sql.includes('SELECT id, status, delivery_count, claimed_by')) {
          return {
            rows: [
              { id: 'job_normal_1', status: 'claimed', delivery_count: 1, claimed_by: 'worker_1' },
              { id: 'job_poison_2', status: 'running', delivery_count: 5, claimed_by: 'worker_2' },
            ],
            rowCount: 2,
          };
        }

        // Rule 2 query: stale workers
        if (sql.includes('UPDATE gpu_workers') && sql.includes("SET status = 'offline'")) {
          return {
            rows: [{ id: 'worker_stale_1' }],
            rowCount: 1,
          };
        }

        // Rule 2 query: clean already offline workers with active_job_id
        if (sql.includes("WHERE status = 'offline'") && sql.includes('active_job_id IS NOT NULL')) {
          return {
            rows: [{ id: 'worker_offline_with_job' }],
            rowCount: 1,
          };
        }

        // Rule 3 query: queued jobs
        if (sql.includes('SELECT id, queued_at, created_at') && sql.includes("WHERE status = 'queued'")) {
          return {
            rows: [
              { id: 'job_overdue_ttl', queued_at: '2026-11-12T00:00:00Z', created_at: '2026-11-12T00:00:00Z', age_seconds: '700' },
              { id: 'job_overdue_maxage', queued_at: '2026-11-12T00:00:00Z', created_at: '2026-11-12T00:00:00Z', age_seconds: '4000' },
            ],
            rowCount: 2,
          };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool;

    const scanner = new GpuRecoveryScanner(mockPool, {
      maxDeliveries: 5,
      offlineAfterSeconds: 60,
      queueTtlSeconds: 600,
      offlinePolicy: 'reject',
      maxAgeSeconds: 3600,
    });

    const simulatedNow = new Date('2026-11-12T01:00:00Z');
    const result = await scanner.runOnce(simulatedNow);

    // Verify transaction boundaries & worker context
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith("SET LOCAL app.is_worker_context = 'true'");
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    // Verify Rule 1 results
    expect(result.requeuedLeases).toEqual(['job_normal_1']);
    expect(result.failedPoisonJobs).toEqual(['job_poison_2']);

    // Verify Rule 2 results
    expect(result.offlineWorkers).toEqual(['worker_stale_1']);
    expect(result.cleanedCurrentJobs).toEqual(['worker_offline_with_job']);

    // Verify Rule 3 results
    expect(result.maxAgeExceededJobs).toEqual(['job_overdue_maxage']);
    expect(result.rejectedTtlJobs).toEqual(['job_overdue_ttl']);
  });

  it('evaluates isGpuOnline with transaction and worker context', async () => {
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT EXISTS')) {
          return { rows: [{ is_online: true }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool;

    const scanner = new GpuRecoveryScanner(mockPool);
    const online = await scanner.isGpuOnline({ offlineThresholdSeconds: 60 });

    expect(online).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith("SET LOCAL app.is_worker_context = 'true'");
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

