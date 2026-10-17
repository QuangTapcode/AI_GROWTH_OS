import { z } from 'zod';
import type { MissingReason } from '../integrations/types';

/**
 * TQ-07 — Schemas for Reports, Metrics, Exceptions & Outbox Events
 */

export const reportQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
  timezone: z.string().trim().default('Asia/Bang_Chi_Minh'),
  currency: z.string().trim().default('VND'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportQueryInput = z.input<typeof reportQuerySchema>;

export interface MetricItem {
  metric: string;
  value: number | null;
  availability: 'available' | 'missing' | 'partial' | 'delayed';
  missing_reason: MissingReason | string | null;
  currency?: string;
}

export const exceptionSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type ExceptionSeverity = z.infer<typeof exceptionSeveritySchema>;

export const exceptionStatusSchema = z.enum(['open', 'investigating', 'resolved', 'ignored']);
export type ExceptionStatus = z.infer<typeof exceptionStatusSchema>;

export const createExceptionSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(255),
    severity: exceptionSeveritySchema.default('medium'),
    source_task_id: z.string().uuid().optional(),
    assigned_owner: z.string().uuid().optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;

export const updateExceptionSchema = z
  .object({
    status: exceptionStatusSchema.optional(),
    assigned_owner: z.string().uuid().nullable().optional(),
    resolution_note: z.string().max(2000).optional(),
  })
  .strict();
export type UpdateExceptionInput = z.infer<typeof updateExceptionSchema>;

export const listExceptionsQuerySchema = z.object({
  status: exceptionStatusSchema.optional(),
  severity: exceptionSeveritySchema.optional(),
  assigned_owner: z.string().uuid("assigned_owner must be a valid UUID").optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const outboxEventSchema = z
  .object({
    event_type: z.string().trim().min(1).max(100),
    dedup_key: z.string().trim().min(1).max(255),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();
export type OutboxEventInput = z.infer<typeof outboxEventSchema>;
