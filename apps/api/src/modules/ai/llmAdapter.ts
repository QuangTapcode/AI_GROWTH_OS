import type { Pool } from "pg";
import { z } from "zod";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { maskSecret, openSecret, sealSecret } from "../../lib/secretBox";
import {
  LLM_PROVIDERS,
  LlmProviderError,
  callProvider,
  cooldownMsFor,
  defaultModel,
  defaultProviderDeps,
  envKey,
  supportsImages,
  type LLMProvider,
  type LlmErrorKind,
  type LlmImage,
  type ProviderDeps,
} from "./providers";

export type { LLMProvider } from "./providers";

/**
 * Multi-LLM Router với Auto-Switch (yêu cầu Leader, Phần IV.2).
 *
 * - Thứ tự mặc định: Gemini (tầng free) → DeepSeek → OpenAI → Claude; chủ quán/ admin đổi được.
 * - Gặp 429 / hết quota / timeout / lỗi 5xx / sai khóa ở nhà cung cấp nào thì chuyển ngay sang nhà kế tiếp
 *   trong cùng request, đồng thời tạm ngưng (cooldown) nhà cung cấp đó để request sau không dội vào nữa.
 * - Không có câu trả lời giả: nếu mọi nhà cung cấp đều lỗi, ném LLM_UNAVAILABLE để agent gọi
 *   chuyển việc cho người (escalate) thay vì gửi nội dung bịa đặt cho khách.
 * - Khóa API được mã hóa trong DB, không bao giờ trả về trình duyệt (chỉ trả dạng ••••1234).
 */

type ProviderStatus = "active" | "ready" | "rate_limited" | "error" | "not_configured";

interface StoredConfig {
  workspace_id: string;
  primary_provider: LLMProvider;
  auto_switch_enabled: boolean;
  fallback_order: LLMProvider[];
  keys: Partial<Record<LLMProvider, string>>; // đã giải mã, chỉ dùng phía server
  cooldowns: Partial<Record<LLMProvider, string>>; // ISO thời điểm hết tạm ngưng
  provider_status: Partial<Record<LLMProvider, ProviderStatus>>;
  active_fallback: LLMProvider | null;
  last_switch_at: string | null;
  last_switch_reason: string | null;
  latency_ms: number | null;
}

export interface PublicLlmConfig {
  workspace_id: string;
  primary_provider: LLMProvider;
  auto_switch_enabled: boolean;
  fallback_order: LLMProvider[];
  providers: Array<{
    provider: LLMProvider;
    model: string;
    key_source: "workspace" | "server_env" | "none";
    key_masked: string | null;
    status: ProviderStatus;
    cooldown_until: string | null;
    supports_images: boolean;
  }>;
  active_fallback: LLMProvider | null;
  last_switch_at: string | null;
  last_switch_reason: string | null;
  latency_ms: number | null;
}

export interface GenerateOptions {
  agent: string;
  system?: string;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Trừ credit ví trả trước của quán (1 credit / lần gọi thành công). */
  billable?: boolean;
  forceProvider?: LLMProvider;
}

export interface GenerateAttempt {
  provider: LLMProvider;
  ok: boolean;
  error_kind?: LlmErrorKind;
  latency_ms: number;
}

export interface GenerateResult {
  text: string;
  provider_used: LLMProvider;
  model: string;
  switched_from?: LLMProvider;
  switch_reason?: string;
  latency_ms: number;
  attempts: GenerateAttempt[];
}

const providerEnum = z.enum(["gemini", "deepseek", "openai", "claude"]);
const keyField = z.union([z.string().trim().max(400), z.null()]).optional();

export const updateLlmConfigSchema = z
  .object({
    primary_provider: providerEnum.optional(),
    auto_switch_enabled: z.boolean().optional(),
    fallback_order: z.array(providerEnum).min(1).max(4).optional(),
    // chuỗi rỗng / null = xóa khóa của workspace (quay về khóa server nếu có)
    gemini_api_key: keyField,
    deepseek_api_key: keyField,
    openai_api_key: keyField,
    claude_api_key: keyField,
  })
  .strict();

export class LlmUnavailableError extends AppError {
  constructor(public readonly attempts: GenerateAttempt[]) {
    super(503, "LLM_UNAVAILABLE", "No LLM provider could answer right now", undefined, { attempts });
  }
}

function dedupeOrder(order: LLMProvider[]): LLMProvider[] {
  const seen = new Set<LLMProvider>();
  const out: LLMProvider[] = [];
  for (const p of [...order, ...LLM_PROVIDERS]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * Thứ tự thử: nhà cung cấp chính trước, rồi fallback_order. Nhà cung cấp đang cooldown bị đẩy xuống cuối
 * (vẫn thử nếu mọi nơi khác đều lỗi). Thuần (pure) để test.
 */
export function planAttemptOrder(
  config: Pick<StoredConfig, "primary_provider" | "fallback_order" | "auto_switch_enabled" | "cooldowns">,
  available: (p: LLMProvider) => boolean,
  now: number,
  forceProvider?: LLMProvider,
): LLMProvider[] {
  if (forceProvider) return available(forceProvider) ? [forceProvider] : [];
  const ordered = dedupeOrder([config.primary_provider, ...config.fallback_order]).filter(available);
  if (!config.auto_switch_enabled) return ordered.slice(0, 1);
  const cooling = (p: LLMProvider) => {
    const until = config.cooldowns[p];
    return until ? Date.parse(until) > now : false;
  };
  return [...ordered.filter((p) => !cooling(p)), ...ordered.filter(cooling)];
}

export class MultiLLMAdapterService {
  constructor(
    private readonly db: Pick<Pool, "query"> = defaultPool,
    private readonly deps: ProviderDeps = defaultProviderDeps,
    private readonly now: () => number = Date.now,
  ) {}

  private async loadStored(workspaceId: string): Promise<StoredConfig> {
    const res = await this.db.query(
      `INSERT INTO llm_adapter_configs (workspace_id) VALUES ($1::uuid)
       ON CONFLICT (workspace_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id
       RETURNING *`,
      [workspaceId],
    );
    const row = res.rows[0] ?? {};
    const keys: Partial<Record<LLMProvider, string>> = {};
    for (const p of LLM_PROVIDERS) {
      const raw = row[`${p}_api_key`];
      const value = raw ? openSecret(raw) : undefined;
      if (value) keys[p] = value;
    }
    const order = Array.isArray(row.fallback_order) ? (row.fallback_order as string[]) : [];
    return {
      workspace_id: workspaceId,
      primary_provider: (providerEnum.safeParse(row.primary_provider).success ? row.primary_provider : "gemini") as LLMProvider,
      auto_switch_enabled: row.auto_switch_enabled ?? true,
      fallback_order: dedupeOrder(order.filter((p): p is LLMProvider => providerEnum.safeParse(p).success)),
      keys,
      cooldowns: (row.cooldowns && typeof row.cooldowns === "object" ? row.cooldowns : {}) as StoredConfig["cooldowns"],
      provider_status: (row.provider_status && typeof row.provider_status === "object" ? row.provider_status : {}) as StoredConfig["provider_status"],
      active_fallback: row.active_fallback ?? null,
      last_switch_at: row.last_switch_at ? new Date(row.last_switch_at).toISOString() : null,
      last_switch_reason: row.last_switch_reason ?? null,
      latency_ms: row.latency_ms ?? null,
    };
  }

  private resolveKey(config: StoredConfig, provider: LLMProvider): { key?: string; source: "workspace" | "server_env" | "none" } {
    if (config.keys[provider]) return { key: config.keys[provider], source: "workspace" };
    const fromEnv = envKey(provider);
    return fromEnv ? { key: fromEnv, source: "server_env" } : { source: "none" };
  }

  private toPublic(config: StoredConfig): PublicLlmConfig {
    const now = this.now();
    return {
      workspace_id: config.workspace_id,
      primary_provider: config.primary_provider,
      auto_switch_enabled: config.auto_switch_enabled,
      fallback_order: config.fallback_order,
      providers: LLM_PROVIDERS.map((provider) => {
        const { key, source } = this.resolveKey(config, provider);
        const until = config.cooldowns[provider];
        const cooling = until && Date.parse(until) > now ? until : null;
        const stored = config.provider_status[provider];
        const status: ProviderStatus = !key ? "not_configured" : cooling ? (stored === "error" ? "error" : "rate_limited") : stored === "active" ? "active" : "ready";
        return {
          provider,
          model: defaultModel(provider),
          key_source: source,
          key_masked: source === "workspace" ? maskSecret(key) : null,
          status,
          cooldown_until: cooling,
          supports_images: supportsImages(provider),
        };
      }),
      active_fallback: config.active_fallback,
      last_switch_at: config.last_switch_at,
      last_switch_reason: config.last_switch_reason,
      latency_ms: config.latency_ms,
    };
  }

  /** Cấu hình an toàn để hiển thị (khóa đã che). */
  async getConfig(workspaceId: string): Promise<PublicLlmConfig> {
    return this.toPublic(await this.loadStored(workspaceId));
  }

  async updateConfig(workspaceId: string, rawInput: unknown): Promise<PublicLlmConfig> {
    const parsed = updateLlmConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_FAILED", "Invalid LLM config payload", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const input = parsed.data;
    const current = await this.loadStored(workspaceId);
    const sets: string[] = [];
    const values: unknown[] = [workspaceId];
    const push = (sql: string, value: unknown) => {
      values.push(value);
      sets.push(`${sql} = $${values.length}`);
    };
    if (input.primary_provider) push("primary_provider", input.primary_provider);
    if (input.auto_switch_enabled !== undefined) push("auto_switch_enabled", input.auto_switch_enabled);
    if (input.fallback_order) push("fallback_order", dedupeOrder(input.fallback_order));
    const clearedCooldowns: LLMProvider[] = [];
    for (const p of LLM_PROVIDERS) {
      const value = input[`${p}_api_key` as const];
      if (value === undefined) continue;
      // Khóa mới → xóa trạng thái lỗi/cooldown cũ của nhà cung cấp đó.
      clearedCooldowns.push(p);
      push(`${p}_api_key`, value ? sealSecret(value) : null);
    }
    if (clearedCooldowns.length > 0) {
      const cooldowns = { ...current.cooldowns };
      const status = { ...current.provider_status };
      for (const p of clearedCooldowns) {
        delete cooldowns[p];
        delete status[p];
      }
      push("cooldowns", JSON.stringify(cooldowns));
      push("provider_status", JSON.stringify(status));
    }
    if (sets.length > 0) {
      await this.db.query(`UPDATE llm_adapter_configs SET ${sets.join(", ")}, updated_at = NOW() WHERE workspace_id = $1::uuid`, values);
    }
    return this.getConfig(workspaceId);
  }

  /** Ping thật: gửi một request rất ngắn tới nhà cung cấp và đo độ trễ. */
  async pingProvider(workspaceId: string, provider: LLMProvider) {
    const config = await this.loadStored(workspaceId);
    const { key } = this.resolveKey(config, provider);
    if (!key) {
      return { provider, status: "error" as const, latency_ms: 0, error_kind: "auth" as LlmErrorKind, message: "Chưa có API key cho nhà cung cấp này" };
    }
    const started = this.now();
    try {
      const res = await callProvider(provider, key, { prompt: "Reply with exactly: OK", maxTokens: 16, timeoutMs: 15_000 }, this.deps);
      const latency = this.now() - started;
      await this.markProvider(workspaceId, provider, "active", null, latency);
      return { provider, status: "ok" as const, latency_ms: latency, model: res.model, message: `Kết nối ${provider} thành công (${res.model})` };
    } catch (err) {
      const e = err instanceof LlmProviderError ? err : new LlmProviderError(provider, "network", String(err));
      const latency = this.now() - started;
      await this.markProvider(workspaceId, provider, e.kind === "auth" ? "error" : "rate_limited", e, null);
      return { provider, status: "error" as const, latency_ms: latency, error_kind: e.kind, message: e.message.slice(0, 300) };
    }
  }

  private async markProvider(
    workspaceId: string,
    provider: LLMProvider,
    status: ProviderStatus,
    error: LlmProviderError | null,
    latency: number | null,
  ): Promise<void> {
    const cooldownMs = error ? cooldownMsFor(error) : 0;
    const until = cooldownMs > 0 ? new Date(this.now() + cooldownMs).toISOString() : null;
    await this.db
      .query(
        `UPDATE llm_adapter_configs
            SET provider_status = provider_status || jsonb_build_object($2::text, $3::text),
                cooldowns = CASE WHEN $4::text IS NULL THEN cooldowns - $2::text
                                 ELSE cooldowns || jsonb_build_object($2::text, $4::text) END,
                latency_ms = COALESCE($5::int, latency_ms),
                updated_at = NOW()
          WHERE workspace_id = $1::uuid`,
        [workspaceId, provider, status, until, latency],
      )
      .catch((err) => console.warn("[llm] could not persist provider status", (err as Error).message));
  }

  private async chargeCredit(workspaceId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO merchant_wallet (workspace_id) VALUES ($1::uuid) ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId],
    );
    const res = await this.db.query(
      `SELECT balance_credits FROM merchant_wallet WHERE workspace_id = $1::uuid`,
      [workspaceId],
    );
    if (Number(res.rows[0]?.balance_credits ?? 0) <= 0) {
      throw new AppError(402, "INSUFFICIENT_CREDITS", "Ví AI đã hết credit. Vui lòng nạp thêm để agent tiếp tục làm việc.");
    }
  }

  private async debitCredit(workspaceId: string): Promise<number> {
    const res = await this.db.query(
      `UPDATE merchant_wallet SET balance_credits = balance_credits - 1, updated_at = NOW()
        WHERE workspace_id = $1::uuid AND balance_credits > 0 RETURNING balance_credits`,
      [workspaceId],
    );
    return res.rows.length > 0 ? 1 : 0;
  }

  private async logUsage(row: {
    workspaceId: string;
    agent: string;
    provider: LLMProvider;
    model: string | null;
    ok: boolean;
    errorKind?: LlmErrorKind;
    errorDetail?: string;
    latency: number;
    inputChars: number;
    outputChars: number;
    switchedFrom?: LLMProvider;
    credits: number;
  }): Promise<void> {
    await this.db
      .query(
        `INSERT INTO llm_usage_events (workspace_id, agent, provider, model, ok, error_kind, error_detail, latency_ms,
                                       input_chars, output_chars, switched_from, credits_charged)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.workspaceId,
          row.agent.slice(0, 64),
          row.provider,
          row.model,
          row.ok,
          row.errorKind ?? null,
          row.errorDetail?.slice(0, 500) ?? null,
          row.latency,
          row.inputChars,
          row.outputChars,
          row.switchedFrom ?? null,
          row.credits,
        ],
      )
      .catch((err) => console.warn("[llm] usage log failed", (err as Error).message));
  }

  async generate(workspaceId: string, options: GenerateOptions): Promise<GenerateResult> {
    const config = await this.loadStored(workspaceId);
    if (options.billable) await this.chargeCredit(workspaceId);
    const needsImages = (options.images?.length ?? 0) > 0;
    const available = (p: LLMProvider) => Boolean(this.resolveKey(config, p).key) && (!needsImages || supportsImages(p));
    const order = planAttemptOrder(config, available, this.now(), options.forceProvider);
    if (order.length === 0) {
      throw new AppError(503, "LLM_NOT_CONFIGURED", needsImages
        ? "Chưa cấu hình nhà cung cấp LLM nào hỗ trợ phân tích ảnh (Gemini/OpenAI/Claude)"
        : "Chưa cấu hình API key cho nhà cung cấp LLM nào");
    }

    const attempts: GenerateAttempt[] = [];
    const started = this.now();
    const inputChars = (options.system?.length ?? 0) + options.prompt.length;
    let firstFailure: { provider: LLMProvider; error: LlmProviderError } | null = null;

    for (const provider of order) {
      const key = this.resolveKey(config, provider).key!;
      const attemptStart = this.now();
      try {
        const res = await callProvider(
          provider,
          key,
          {
            system: options.system,
            prompt: options.prompt,
            images: options.images,
            maxTokens: options.maxTokens ?? 800,
            json: options.json,
            timeoutMs: options.timeoutMs ?? 25_000,
          },
          this.deps,
        );
        const latency = this.now() - attemptStart;
        attempts.push({ provider, ok: true, latency_ms: latency });
        const switchedFrom = firstFailure?.provider;
        const credits = options.billable ? await this.debitCredit(workspaceId) : 0;
        await this.markProvider(workspaceId, provider, "active", null, latency);
        if (switchedFrom) {
          await this.db
            .query(
              `UPDATE llm_adapter_configs SET active_fallback = $2, last_switch_at = NOW(), last_switch_reason = $3 WHERE workspace_id = $1::uuid`,
              [workspaceId, provider, `Auto-Switch ${switchedFrom} → ${provider}: ${firstFailure!.error.kind} (${firstFailure!.error.message.slice(0, 160)})`],
            )
            .catch(() => undefined);
        }
        await this.logUsage({
          workspaceId,
          agent: options.agent,
          provider,
          model: res.model,
          ok: true,
          latency,
          inputChars,
          outputChars: res.text.length,
          switchedFrom,
          credits,
        });
        return {
          text: res.text,
          provider_used: provider,
          model: res.model,
          ...(switchedFrom
            ? { switched_from: switchedFrom, switch_reason: `${switchedFrom} lỗi ${firstFailure!.error.kind}, đã tự chuyển sang ${provider}` }
            : {}),
          latency_ms: this.now() - started,
          attempts,
        };
      } catch (err) {
        const error = err instanceof LlmProviderError ? err : new LlmProviderError(provider, "network", (err as Error)?.message ?? String(err));
        const latency = this.now() - attemptStart;
        attempts.push({ provider, ok: false, error_kind: error.kind, latency_ms: latency });
        if (!firstFailure) firstFailure = { provider, error };
        await this.markProvider(workspaceId, provider, error.kind === "auth" ? "error" : "rate_limited", error, null);
        await this.logUsage({
          workspaceId,
          agent: options.agent,
          provider,
          model: defaultModel(provider),
          ok: false,
          errorKind: error.kind,
          errorDetail: error.message,
          latency,
          inputChars,
          outputChars: 0,
          credits: 0,
        });
      }
    }
    throw new LlmUnavailableError(attempts);
  }

  /** Tương thích code cũ: trả về cùng shape { text, provider_used, ... }. */
  async generateTextWithAutoSwitch(
    workspaceId: string,
    prompt: string,
    options: { systemPrompt?: string; maxTokens?: number; forceProvider?: LLMProvider; agent?: string } = {},
  ): Promise<GenerateResult> {
    return this.generate(workspaceId, {
      agent: options.agent ?? "legacy",
      system: options.systemPrompt,
      prompt,
      maxTokens: options.maxTokens,
      forceProvider: options.forceProvider,
    });
  }
}

/** Đọc JSON từ câu trả lời LLM (chịu được ```json fences hoặc chữ thừa trước/sau). */
export function parseJsonReply<T = unknown>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("LLM reply is not valid JSON");
  }
}
