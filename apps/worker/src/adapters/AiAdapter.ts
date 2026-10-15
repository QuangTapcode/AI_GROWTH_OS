import type { JobOperator } from '../jobs/JobState';

/**
 * Giao tiếp worker ↔ AI (W1-MY-01): W1 dùng FakeAiAdapter để test nội bộ
 * không phụ thuộc service Python; adapter HTTP thật nối sau (W2).
 */
export interface AiRunRequest {
  operation: JobOperator;
  input: Record<string, unknown>;
  /** Idempotency key để AI service không tính trùng call khi worker retry */
  idempotency_key?: string;
}

export interface AiRunResult {
  output: Record<string, unknown>;
  model: string;
  schema_version: string;
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
