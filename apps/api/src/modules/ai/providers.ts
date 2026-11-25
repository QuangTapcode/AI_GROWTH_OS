/**
 * Gọi thật từng nhà cung cấp LLM (Gemini, DeepSeek, OpenAI, Claude) và chuẩn hóa lỗi để bộ định tuyến
 * Multi-LLM quyết định có chuyển sang nhà cung cấp khác hay không.
 *
 * Claude được gọi qua SDK chính thức `@anthropic-ai/sdk` (nạp động): khi gói chưa được cài,
 * Claude được báo là "chưa sẵn sàng" và bị bỏ qua thay vì giả lập câu trả lời.
 */

export type LLMProvider = "gemini" | "deepseek" | "openai" | "claude";
export const LLM_PROVIDERS: readonly LLMProvider[] = ["gemini", "deepseek", "openai", "claude"] as const;

export type LlmErrorKind =
  | "rate_limited"
  | "quota"
  | "timeout"
  | "auth"
  | "server"
  | "bad_request"
  | "network"
  | "refusal"
  | "empty"
  | "unavailable";

export class LlmProviderError extends Error {
  constructor(
    public readonly provider: LLMProvider,
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface LlmImage {
  mimeType: string;
  base64: string;
}

export interface ProviderRequest {
  system?: string;
  prompt: string;
  images?: LlmImage[];
  maxTokens: number;
  /** Yêu cầu trả về một object JSON duy nhất. */
  json?: boolean;
  timeoutMs: number;
}

export interface ProviderResponse {
  text: string;
  model: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderDeps {
  fetch: FetchLike;
  /** Tạo client Claude; trả null khi SDK chưa được cài. Có thể thay trong test. */
  loadClaudeSdk: () => Promise<ClaudeSdkModule | null>;
}

/** Phần tối thiểu của SDK Anthropic mà router dùng (SDK được nạp động nên không import type được). */
export interface ClaudeSdkModule {
  default: new (opts: { apiKey: string; maxRetries?: number; timeout?: number }) => {
    beta: { messages: { create: (body: Record<string, unknown>) => Promise<ClaudeMessage> } };
  };
}
interface ClaudeMessage {
  model?: string;
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  content: Array<{ type: string; text?: string }>;
}

export function defaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "gemini":
      return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    case "deepseek":
      return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
    case "openai":
      return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    case "claude":
      return process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5";
  }
}

export function envKey(provider: LLMProvider): string | undefined {
  const value =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : provider === "deepseek"
        ? process.env.DEEPSEEK_API_KEY
        : provider === "openai"
          ? process.env.OPENAI_API_KEY
          : process.env.ANTHROPIC_API_KEY;
  return value?.trim() || undefined;
}

/** DeepSeek chat API không nhận ảnh: không dùng cho tác vụ phân tích ảnh. */
export function supportsImages(provider: LLMProvider): boolean {
  return provider !== "deepseek";
}

let cachedClaudeSdk: Promise<ClaudeSdkModule | null> | null = null;
export function loadInstalledClaudeSdk(): Promise<ClaudeSdkModule | null> {
  if (!cachedClaudeSdk) {
    // Nạp động để build không phụ thuộc gói; bundler không được phân giải tên gói này lúc build.
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<ClaudeSdkModule>;
    cachedClaudeSdk = dynamicImport("@anthropic-ai/sdk").catch(() => null);
  }
  return cachedClaudeSdk;
}

export const defaultProviderDeps: ProviderDeps = {
  fetch: (input, init) => fetch(input, init),
  loadClaudeSdk: loadInstalledClaudeSdk,
};

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function classifyHttp(status: number, body: string): LlmErrorKind {
  const lower = body.toLowerCase();
  if (status === 429) {
    return /quota|billing|insufficient_quota|exceeded your current quota|credit/.test(lower) ? "quota" : "rate_limited";
  }
  if (status === 402) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "bad_request";
}

function transportError(provider: LLMProvider, err: unknown): LlmProviderError {
  const e = err as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return new LlmProviderError(provider, "timeout", `${provider} timed out`);
  }
  return new LlmProviderError(provider, "network", `${provider} network error: ${e?.message ?? String(err)}`);
}

async function postJson(
  provider: LLMProvider,
  deps: ProviderDeps,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<any> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw transportError(provider, err);
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    // Gemini trả RetryInfo.retryDelay ("27s") trong body thay vì header.
    const delay = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (retryAfterMs === undefined && delay) retryAfterMs = Number(delay[1]) * 1000;
    let kind = classifyHttp(res.status, text);
    // Hạn mức theo phút của Gemini cũng báo "Quota exceeded" nhưng kèm retryDelay ngắn: đó là rate limit, không phải hết quota ngày.
    if (kind === "quota" && retryAfterMs !== undefined && retryAfterMs <= 120_000) kind = "rate_limited";
    throw new LlmProviderError(
      provider,
      kind,
      `${provider} HTTP ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      retryAfterMs,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmProviderError(provider, "server", `${provider} returned non-JSON body`);
  }
}

async function callGemini(key: string, model: string, req: ProviderRequest, deps: ProviderDeps): Promise<ProviderResponse> {
  const parts: Array<Record<string, unknown>> = [{ text: req.prompt }];
  for (const image of req.images ?? []) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }
  const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens };
  if (req.json) generationConfig.responseMimeType = "application/json";
  // 2.5 Flash mặc định "suy nghĩ" và tiêu token đầu ra; tác vụ ở đây ngắn nên tắt.
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const data = await postJson(
    "gemini",
    deps,
    `${(process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com").replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig,
    },
    req.timeoutMs,
  );
  if (data?.promptFeedback?.blockReason) {
    throw new LlmProviderError("gemini", "refusal", `gemini blocked prompt: ${data.promptFeedback.blockReason}`);
  }
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new LlmProviderError("gemini", "refusal", `gemini finishReason ${candidate.finishReason}`);
  }
  const text = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new LlmProviderError("gemini", "empty", "gemini returned no text");
  return { text, model };
}

async function callOpenAiCompatible(
  provider: "deepseek" | "openai",
  key: string,
  model: string,
  req: ProviderRequest,
  deps: ProviderDeps,
): Promise<ProviderResponse> {
  const baseUrl =
    provider === "deepseek"
      ? (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "")
      : (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const userContent =
    req.images && req.images.length > 0
      ? [
          { type: "text", text: req.prompt },
          ...req.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
        ]
      : req.prompt;
  const body: Record<string, unknown> = {
    model,
    messages: [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content: userContent }],
    ...(provider === "openai" ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }),
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
  };
  const data = await postJson(provider, deps, `${baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, body, req.timeoutMs);
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    throw new LlmProviderError(provider, "refusal", `${provider} content_filter`);
  }
  const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
  if (!text) throw new LlmProviderError(provider, "empty", `${provider} returned no text`);
  return { text, model: typeof data?.model === "string" ? data.model : model };
}

async function callClaude(key: string, model: string, req: ProviderRequest, deps: ProviderDeps): Promise<ProviderResponse> {
  const sdk = await deps.loadClaudeSdk();
  if (!sdk) {
    throw new LlmProviderError("claude", "unavailable", "@anthropic-ai/sdk is not installed in apps/api");
  }
  // Router tự chuyển nhà cung cấp, nên SDK không tự retry (maxRetries 0).
  const client = new sdk.default({ apiKey: key, maxRetries: 0, timeout: req.timeoutMs });
  const content: Array<Record<string, unknown>> = [
    ...(req.images ?? []).map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mimeType, data: img.base64 },
    })),
    { type: "text", text: req.json ? `${req.prompt}\n\nChỉ trả về một object JSON hợp lệ, không kèm giải thích.` : req.prompt },
  ];
  let message: ClaudeMessage;
  try {
    message = await client.beta.messages.create({
      model,
      max_tokens: Math.max(req.maxTokens, 1024),
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content }],
      // Tác vụ ngắn (trả lời review/comment, phân loại): effort thấp cho nhanh và rẻ.
      output_config: { effort: "low" },
      // Khi bị bộ lọc an toàn từ chối, API tự chạy lại trên model dự phòng phù hợp.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    const e = err as { status?: number; message?: string; headers?: Record<string, string> | Headers; name?: string };
    if (typeof e?.status === "number") {
      const headerValue =
        e.headers && typeof (e.headers as Headers).get === "function"
          ? (e.headers as Headers).get("retry-after")
          : (e.headers as Record<string, string> | undefined)?.["retry-after"];
      const kind: LlmErrorKind = e.status === 529 ? "server" : classifyHttp(e.status, e.message ?? "");
      throw new LlmProviderError("claude", kind, `claude HTTP ${e.status}: ${(e.message ?? "").slice(0, 300)}`, e.status, parseRetryAfter(headerValue));
    }
    throw transportError("claude", err);
  }
  if (message.stop_reason === "refusal") {
    throw new LlmProviderError("claude", "refusal", `claude refusal: ${message.stop_details?.category ?? "unspecified"}`);
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!text) throw new LlmProviderError("claude", "empty", "claude returned no text");
  return { text, model: message.model ?? model };
}

export async function callProvider(
  provider: LLMProvider,
  key: string,
  req: ProviderRequest,
  deps: ProviderDeps = defaultProviderDeps,
  model: string = defaultModel(provider),
): Promise<ProviderResponse> {
  switch (provider) {
    case "gemini":
      return callGemini(key, model, req, deps);
    case "deepseek":
    case "openai":
      return callOpenAiCompatible(provider, key, model, req, deps);
    case "claude":
      return callClaude(key, model, req, deps);
  }
}

/** Thời gian tạm ngưng một nhà cung cấp sau lỗi, để không dội tiếp request vào nơi đang quá tải. */
export function cooldownMsFor(error: LlmProviderError): number {
  switch (error.kind) {
    case "rate_limited":
      return Math.min(Math.max(error.retryAfterMs ?? 60_000, 5_000), 15 * 60_000);
    case "quota":
      return Math.max(error.retryAfterMs ?? 0, 15 * 60_000);
    case "auth":
      return 10 * 60_000;
    case "unavailable":
      return 10 * 60_000;
    case "server":
    case "timeout":
    case "network":
      return 30_000;
    default:
      return 0;
  }
}
