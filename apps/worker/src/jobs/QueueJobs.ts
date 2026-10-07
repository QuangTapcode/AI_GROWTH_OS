import { QueueJobs as Q } from './QueueConfig';

export { Q as QueueJobs };
export const JobNames = Q;

/**
 * Default job schedules (pg-boss Cron) - W1 only; no recurring production jobs yet
 */
export const DefaultSchedules = {} as const;

/**
 * Timeout helper for deterministic kill/stop tests
 */
export function jobTimeout(ms: number): NodeJS.Timeout {
  return setTimeout(() => {
    // noop; worker handles stop via flag
  }, ms);
}

export function clearJobTimeout(id: NodeJS.Timeout): void {
  clearTimeout(id);
}
