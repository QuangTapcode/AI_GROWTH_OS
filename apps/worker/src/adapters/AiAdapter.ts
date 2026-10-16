import type { JobOperator } from '../jobs/JobState';

/**
 * Giao tiếp worker ↔ AI.
 * - FakeAiAdapter (AI_PROVIDER_MODE=fake, mặc định): deterministic, test nội bộ.
 * - HttpAiAdapter (AI_PROVIDER_MODE=live): contract CR-001 POST /internal/v1/runs.
 */
export interface AiSourceVersionRef {
  source_id: string;
  version: number;
}

export interface AiRunRequest {
  operation: JobOperator;
  input: Record<string, unknown>;
  /** Idempotency key để AI service không tính trùng call khi worker retry */
  idempotency_key?: string;
  /** Worker operation đã map sang AI operation (research → research.run) */
  aiOperation?: string;
  /** Context bắt buộc với HttpAiAdapter — AI service validate theo CR-001 */
  job_id?: string;
  workspace_id?: string;
  input_version?: number;
  trace_id?: string;
  context_snapshot_id?: string | null;
  approved_source_versions?: AiSourceVersionRef[];
  /** Pin phiên bản prompt/model nếu consumer yêu cầu đúng bản đã duyệt */
  prompt_version?: string;
  model_version?: string;
  /** Đánh dấu fixture; chỉ dùng với input TEST/provenance hợp lệ */
  synthetic?: boolean;
}

export interface AiRunResult {
  output: Record<string, unknown>;
  model: string;
  schema_version: string;
  /** Run/artifact từ AI run store (CR-002) — persist cùng job result */
  run_id?: string;
  artifact?: Record<string, unknown> | null;
  evidence?: unknown[];
  provider_calls?: number;
}

export interface AiAdapter {
  run(req: AiRunRequest): Promise<AiRunResult>;
}

export interface FakeAiAdapterOptions {
  /** Chờ mỗi call (ms) — dùng cho test timeout */
  latencyMs?: number;
  /** N fail đầu tiên rồi trả kết quả (mô tả flaky provider) */
  failuresBeforeSuccess?: number;
  /** Tùy biến output; mặc định echo input gắn nhãn synthetic */
  outputFor?: (req: AiRunRequest) => Record<string, unknown>;
}

/**
 * Fake AI adapter xác định (deterministic): cùng input → cùng output.
 * `failuresBeforeSuccess` cho phép test retry không cần API thật.
 */
export class FakeAiAdapter implements AiAdapter {
  /** Ghi lại từng call để test.assert budget provider-call */
  readonly calls: AiRunRequest[] = [];

  constructor(private readonly opts: FakeAiAdapterOptions = {}) {}

  async run(req: AiRunRequest): Promise<AiRunResult> {
    this.calls.push(req);
    if (this.opts.latencyMs) {
      await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    }
    const failures = this.opts.failuresBeforeSuccess ?? 0;
    if (this.calls.length <= failures) {
      throw new Error('FAKE_AI_FAILURE');
    }
    return {
      output: this.opts.outputFor
        ? this.opts.outputFor(req)
        : { synthetic: true, operation: req.operation, echo: req.input },
      model: 'fake-model-1',
      schema_version: '1.0.0',
    };
  }
}
