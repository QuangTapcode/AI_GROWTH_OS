import type { AiAdapter, AiRunRequest, AiRunResult } from './AiAdapter';

/**
 * HTTP adapter nối worker tới AI service theo contract CR-001 (MY-01).
 *
 * - POST {base}/internal/v1/runs với JobRequest đầy đủ (job_id + operation +
 *   input_version là idempotency key); resend cùng request → AI resume run cũ.
 * - Poll GET /internal/v1/runs/{run_id} tới trạng thái terminal.
 * - Auth nội bộ: Authorization: Bearer {INTERNAL_AI_AUTH_TOKEN} (nếu có).
 * - Lỗi: envelope {error:{code,message,request_id,details}} — 4xx (validation,
 *   conflict, unauthorized) là permanent; 429/5xx/network là retryable.
 * - Cancel: contract chưa có AI-side cancel → cancel(runId) chỉ ngừng poll local;
 *   run phía AI chạy tới hết và kết quả nằm trong AI run store.
 */

const SCHEMA_VERSION = '1.0.0';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lỗi HTTP phía AI. `permanent=true` → JobRunner không retry. */
export class AiHttpError extends Error {
  readonly code: string;
  readonly permanent: boolean;
  readonly requestId: string | null;

  constructor(
    code: string,
    message: string,
    opts: { permanent: boolean; requestId?: string | null; cause?: unknown },
  ) {
    super(message);
    this.name = 'AiHttpError';
    this.code = code;
    this.permanent = opts.permanent;
    this.requestId = opts.requestId ?? null;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export interface HttpAiAdapterOptions {
  baseUrl: string;
  /** INTERNAL_AI_AUTH_TOKEN phía worker; bỏ trống = AI service không bật auth */
  token?: string;
  /** Inject được cho test; mặc định global fetch */
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  /** Tổng thời gian poll tối đa cho một run (quá → AI_POLL_TIMEOUT retryable) */
  pollTimeoutMs?: number;
  requestTimeoutMs?: number;
}

/** RunStatus JSON trả về từ AI service (CR-001 §Run status). */
interface AiRunStatus {
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  provider_calls?: number;
  retryable?: boolean;
  result?: {
    result: Record<string, unknown>;
    evidence?: unknown[];
    warnings?: string[];
    model_version?: string;
    prompt_version?: string;
    schema_version?: string;
    artifact?: Record<string, unknown> | null;
  } | null;
  error_code?: string | null;
  error_message?: string | null;
}

/** 4xx là permanent, 429/5xx là retryable (CR-001 error codes). */
function isPermanentStatus(status: number): boolean {
  if (status === 429) return false;
  return status >= 400 && status < 500;
}

export class HttpAiAdapter implements AiAdapter {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  /** runId → controller của vòng poll; cancel(runId) ngừng poll local */
  private readonly pending = new Map<string, AbortController>();

  constructor(opts: HttpAiAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1_000;
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 600_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
  }

  /** Dừng poll một run; run phía service vẫn giữ nguyên (contract chưa có cancel endpoint). */
  cancel(runId: string): void {
    this.pending.get(runId)?.abort();
  }

  async run(req: AiRunRequest): Promise<AiRunResult> {
    const body = this.buildJobRequest(req);
    const created = await this.request<AiRunStatus>('POST', '/internal/v1/runs', body);
    const final = await this.awaitTerminal(created);
    return this.toResult(final);
  }

  private buildJobRequest(req: AiRunRequest): Record<string, unknown> {
    // Context thiếu/sai kiểu là lỗi lập trình phía worker → permanent, không retry.
    if (!req.job_id || !UUID_RE.test(req.job_id)) {
      throw new AiHttpError('INVALID_JOB_ID', 'job_id phải là UUID (CR-001 JobRequest)', { permanent: true });
    }
    if (!req.workspace_id || !UUID_RE.test(req.workspace_id)) {
      throw new AiHttpError('INVALID_WORKSPACE_ID', 'workspace_id phải là UUID (CR-001 JobRequest)', {
        permanent: true,
      });
    }
    if (!req.input_version || req.input_version < 1) {
      throw new AiHttpError('INVALID_INPUT_VERSION', 'input_version phải >= 1', { permanent: true });
    }
    if (!req.trace_id) {
      throw new AiHttpError('INVALID_TRACE_ID', 'trace_id là bắt buộc', { permanent: true });
    }
    return {
      schema_version: SCHEMA_VERSION,
      job_id: req.job_id,
      workspace_id: req.workspace_id,
      operation: req.aiOperation ?? req.operation,
      input_version: req.input_version,
      trace_id: req.trace_id,
      payload: req.input,
      ...(req.context_snapshot_id ? { context_snapshot_id: req.context_snapshot_id } : {}),
      ...(req.approved_source_versions?.length
        ? { approved_source_versions: req.approved_source_versions }
        : {}),
      ...(req.prompt_version ? { prompt_version: req.prompt_version } : {}),
      ...(req.model_version ? { model_version: req.model_version } : {}),
      ...(req.synthetic ? { synthetic: true } : {}),
      ...(req.timeout_seconds ? { constraints: { timeout_seconds: req.timeout_seconds } } : {}),
    };
  }

  private async awaitTerminal(first: AiRunStatus): Promise<AiRunStatus> {
    if (first.status === 'completed' || first.status === 'failed') return first;
    const controller = new AbortController();
    this.pending.set(first.run_id, controller);
    const deadline = Date.now() + this.pollTimeoutMs;
    try {
      let current = first;
      while (current.status === 'queued' || current.status === 'running') {
        if (controller.signal.aborted) {
          throw new AiHttpError('RUN_CANCELLED', 'worker ngừng poll theo yêu cầu; run vẫn lưu trong AI run store', {
            permanent: true,
          });
        }
        if (Date.now() > deadline) {
          throw new AiHttpError('AI_POLL_TIMEOUT', `quá thời gian poll ${this.pollTimeoutMs}ms; resend cùng request để resume`, {
            permanent: false,
          });
        }
        await this.sleep(this.pollIntervalMs, controller.signal);
        current = await this.request<AiRunStatus>('GET', `/internal/v1/runs/${first.run_id}`);
      }
      return current;
    } finally {
      this.pending.delete(first.run_id);
    }
  }

  private toResult(status: AiRunStatus): AiRunResult {
    if (status.status !== 'completed' || !status.result) {
      const code = status.error_code ?? 'AI_RUN_FAILED';
      throw new AiHttpError(code, status.error_message ?? 'AI run không completed', {
        // AI service đã phân loại retryable (CR-001); không retry khi service xác định lỗi input/fact.
        permanent: status.retryable !== true,
      });
    }
    return {
      output: status.result.result ?? {},
      model: status.result.model_version ?? '',
      prompt_version: status.result.prompt_version,
      schema_version: status.result.schema_version ?? SCHEMA_VERSION,
      run_id: status.run_id,
      artifact: status.result.artifact ?? null,
      evidence: status.result.evidence ?? [],
      provider_calls: status.provider_calls,
    };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    timer.unref?.();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AiHttpError('AI_UNREACHABLE', `không gọi được AI service: ${(err as Error).message}`, {
        permanent: false,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    const requestId = response.headers.get('x-request-id');
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let message = `AI service trả HTTP ${response.status}`;
      try {
        const envelope = (await response.json()) as { error?: { code?: string; message?: string } };
        if (envelope.error?.code) code = envelope.error.code;
        if (envelope.error?.message) message = envelope.error.message;
      } catch {
        // response không phải JSON envelope → giữ mã HTTP mặc định
      }
      throw new AiHttpError(code, message, { permanent: isPermanentStatus(response.status), requestId });
    }
    return (await response.json()) as T;
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new AiHttpError('RUN_CANCELLED', 'poll đã bị cancel', { permanent: true }));
        },
        { once: true },
      );
    });
  }
}
