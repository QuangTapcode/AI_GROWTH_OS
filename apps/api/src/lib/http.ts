import { randomUUID } from 'node:crypto';

/**
 * HTTP result + error envelope chuẩn contracts/README:
 * lỗi thống nhất `{error: {code, message, request_id, field_errors?, details?}}`.
 * Handler module trả HttpResult; core router (Thiệu Quang, W1-BE-01) nối sau.
 */
export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export function newRequestId(): string {
  return randomUUID();
}

export function httpOk(status: number, body: Record<string, unknown>): HttpResult {
  return { status, body };
}

export function httpError(
  status: number,
  code: string,
  message: string,
  opts: { request_id?: string; field_errors?: FieldError[]; details?: Record<string, unknown> } = {},
): HttpResult {
  const error: Record<string, unknown> = { code, message, request_id: opts.request_id ?? newRequestId() };
  if (opts.field_errors && opts.field_errors.length > 0) error.field_errors = opts.field_errors;
  if (opts.details) error.details = opts.details;
  return { status, body: { error } };
}