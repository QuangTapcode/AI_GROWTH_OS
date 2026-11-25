import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LlmUnavailableError, MultiLLMAdapterService, parseJsonReply, planAttemptOrder } from "../../src/modules/ai/llmAdapter";
import { LlmProviderError, cooldownMsFor, type ProviderDeps } from "../../src/modules/ai/providers";
import { sealSecret } from "../../src/lib/secretBox";
import { createFakeDb, jsonResponse } from "./fakeDb";

const WS = "11111111-1111-4111-8111-111111111111";
const ENV_KEYS = ["GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TOKEN_ENCRYPTION_KEY"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key";
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function configDb(row: Record<string, unknown> = {}, wallet = 100) {
  let balance = wallet;
  return createFakeDb([
    [/INSERT INTO llm_adapter_configs/, () => [{ workspace_id: WS, primary_provider: "gemini", auto_switch_enabled: true, fallback_order: ["gemini", "deepseek", "openai", "claude"], cooldowns: {}, provider_status: {}, ...row }]],
    [/SELECT balance_credits FROM merchant_wallet/, () => [{ balance_credits: balance }]],
    [/UPDATE merchant_wallet SET balance_credits = balance_credits - 1/, () => (balance > 0 ? [{ balance_credits: --balance }] : [])],
  ]);
}

function deps(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, claude: ProviderDeps["loadClaudeSdk"] = async () => null): ProviderDeps {
  return { fetch: async (url, init) => handler(url, init), loadClaudeSdk: claude };
}

const geminiOk = (text: string) => jsonResponse(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
const openAiOk = (text: string) => jsonResponse(200, { model: "deepseek-chat", choices: [{ message: { content: text }, finish_reason: "stop" }] });

describe("Multi-LLM router: Auto-Switch", () => {
  it("Gemini trả 429 RESOURCE_EXHAUSTED → tự chuyển DeepSeek trong cùng request và ghi cooldown cho Gemini", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.DEEPSEEK_API_KEY = "d-key";
    const db = configDb();
    const urls: string[] = [];
    const service = new MultiLLMAdapterService(
      db as any,
      deps((url) => {
        urls.push(url);
        if (url.includes("generativelanguage")) {
          return jsonResponse(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "27s" }] } });
        }
        return openAiOk("Dạ quán cảm ơn anh/chị!");
      }),
    );
    const res = await service.generate(WS, { agent: "comment_reply", prompt: "hi" });
    expect(res.provider_used).toBe("deepseek");
    expect(res.switched_from).toBe("gemini");
    expect(res.text).toBe("Dạ quán cảm ơn anh/chị!");
    expect(res.attempts.map((a) => [a.provider, a.ok, a.error_kind])).toEqual([
      ["gemini", false, "rate_limited"],
      ["deepseek", true, undefined],
    ]);
    expect(urls[1]).toBe("https://api.deepseek.com/chat/completions");
    const cooldownWrite = db.callsMatching(/cooldowns \|\| jsonb_build_object/).find((c) => c.params[1] === "gemini");
    expect(cooldownWrite).toBeDefined();
    const until = Date.parse(String(cooldownWrite!.params[3]));
    expect(until - Date.now()).toBeGreaterThan(20_000); // retryDelay 27s được tôn trọng
    const usage = db.callsMatching(/INSERT INTO llm_usage_events/);
    expect(usage).toHaveLength(2);
    expect(usage[1].params[10]).toBe("gemini"); // switched_from
  });

  it("nhà cung cấp đang cooldown bị đẩy xuống cuối hàng đợi", () => {
    const order = planAttemptOrder(
      { primary_provider: "gemini", fallback_order: ["gemini", "deepseek", "openai", "claude"], auto_switch_enabled: true, cooldowns: { gemini: new Date(Date.now() + 60_000).toISOString() } },
      () => true,
      Date.now(),
    );
    expect(order).toEqual(["deepseek", "openai", "claude", "gemini"]);
  });

  it("tắt Auto-Switch → chỉ thử nhà cung cấp chính", () => {
    expect(planAttemptOrder({ primary_provider: "openai", fallback_order: ["gemini"], auto_switch_enabled: false, cooldowns: {} }, () => true, Date.now())).toEqual(["openai"]);
  });

  it("mọi nhà cung cấp lỗi → LLM_UNAVAILABLE (không bịa câu trả lời)", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    const service = new MultiLLMAdapterService(configDb() as any, deps(() => jsonResponse(503, { error: "overloaded" })));
    const err = await service.generate(WS, { agent: "x", prompt: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(err.code).toBe("LLM_UNAVAILABLE");
    expect(err.attempts.map((a: { provider: string }) => a.provider)).toEqual(["gemini", "openai"]);
  });

  it("chưa có khóa nào → LLM_NOT_CONFIGURED", async () => {
    const service = new MultiLLMAdapterService(configDb() as any, deps(() => geminiOk("x")));
    await expect(service.generate(WS, { agent: "x", prompt: "hi" })).rejects.toMatchObject({ code: "LLM_NOT_CONFIGURED" });
  });

  it("phân tích ảnh bỏ qua DeepSeek (không hỗ trợ ảnh)", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.DEEPSEEK_API_KEY = "d";
    process.env.OPENAI_API_KEY = "o";
    const seen: string[] = [];
    const service = new MultiLLMAdapterService(
      configDb() as any,
      deps((url) => {
        seen.push(url);
        return url.includes("generativelanguage") ? jsonResponse(500, "boom") : openAiOk('{"ok":true}');
      }),
    );
    const res = await service.generate(WS, { agent: "asset_manager", prompt: "p", images: [{ mimeType: "image/jpeg", base64: "AAAA" }] });
    expect(res.provider_used).toBe("openai");
    expect(seen.some((u) => u.includes("deepseek"))).toBe(false);
    const body = seen.length; // gemini + openai
    expect(body).toBe(2);
  });

  it("Claude: SDK chưa cài → báo unavailable và chuyển nhà kế tiếp; SDK có → gọi messages với fallback mặc định", async () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENAI_API_KEY = "o";
    const db = configDb({ primary_provider: "claude" });
    const noSdk = new MultiLLMAdapterService(db as any, deps(() => openAiOk("from openai")));
    const r1 = await noSdk.generate(WS, { agent: "x", prompt: "hi" });
    expect(r1.provider_used).toBe("openai");
    expect(r1.attempts[0]).toMatchObject({ provider: "claude", ok: false, error_kind: "unavailable" });

    let captured: Record<string, unknown> | null = null;
    class FakeAnthropic {
      beta = {
        messages: {
          create: async (body: Record<string, unknown>) => {
            captured = body;
            return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "xin chào" }] };
          },
        },
      };
    }
    const withSdk = new MultiLLMAdapterService(configDb({ primary_provider: "claude" }) as any, deps(() => openAiOk("x"), async () => ({ default: FakeAnthropic as any })));
    const r2 = await withSdk.generate(WS, { agent: "x", prompt: "hi", system: "sys" });
    expect(r2.provider_used).toBe("claude");
    expect(captured).toMatchObject({ model: "claude-opus-5-5", system: "sys", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  });

  it("Claude stop_reason refusal → coi là lỗi refusal và chuyển nhà khác", async () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.GEMINI_API_KEY = "g";
    class RefusingAnthropic {
      beta = { messages: { create: async () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }) } };
    }
    const service = new MultiLLMAdapterService(configDb({ primary_provider: "claude" }) as any, deps(() => geminiOk("ok gemini"), async () => ({ default: RefusingAnthropic as any })));
    const res = await service.generate(WS, { agent: "x", prompt: "hi" });
    expect(res.provider_used).toBe("gemini");
    expect(res.attempts[0].error_kind).toBe("refusal");
  });

  it("ví hết credit → 402 INSUFFICIENT_CREDITS, không gọi LLM", async () => {
    process.env.GEMINI_API_KEY = "g";
    let called = false;
    const service = new MultiLLMAdapterService(configDb({}, 0) as any, deps(() => ((called = true), geminiOk("x"))));
    await expect(service.generate(WS, { agent: "x", prompt: "hi", billable: true })).rejects.toMatchObject({ statusCode: 402, code: "INSUFFICIENT_CREDITS" });
    expect(called).toBe(false);
  });

  it("gọi thành công có billable → trừ đúng 1 credit và ghi vào usage", async () => {
    process.env.GEMINI_API_KEY = "g";
    const db = configDb({}, 5);
    const service = new MultiLLMAdapterService(db as any, deps(() => geminiOk("ok")));
    await service.generate(WS, { agent: "gmaps_specialist", prompt: "hi", billable: true });
    expect(db.callsMatching(/balance_credits - 1/)).toHaveLength(1);
    const usage = db.callsMatching(/INSERT INTO llm_usage_events/)[0];
    expect(usage.params[11]).toBe(1);
  });
});

describe("Multi-LLM router: cấu hình & bảo mật khóa", () => {
  it("getConfig không bao giờ trả khóa thật, chỉ ••••4 ký tự cuối", async () => {
    const db = configDb({ gemini_api_key: sealSecret("AIzaSy-secret-1234"), deepseek_api_key: null });
    process.env.OPENAI_API_KEY = "sk-env";
    const cfg = await new MultiLLMAdapterService(db as any, deps(() => geminiOk("x"))).getConfig(WS);
    const json = JSON.stringify(cfg);
    expect(json).not.toContain("AIzaSy-secret");
    expect(json).not.toContain("sk-env");
    const gemini = cfg.providers.find((p) => p.provider === "gemini")!;
    expect(gemini).toMatchObject({ key_source: "workspace", key_masked: "••••1234" });
    expect(cfg.providers.find((p) => p.provider === "openai")).toMatchObject({ key_source: "server_env", key_masked: null });
    expect(cfg.providers.find((p) => p.provider === "deepseek")).toMatchObject({ key_source: "none", status: "not_configured" });
  });

  it("updateConfig lưu khóa đã mã hóa (enc:v1:) và xóa cooldown cũ", async () => {
    const db = configDb({ cooldowns: { gemini: new Date(Date.now() + 60_000).toISOString() } });
    await new MultiLLMAdapterService(db as any, deps(() => geminiOk("x"))).updateConfig(WS, { gemini_api_key: "AIza-new-key-9999" });
    const update = db.callsMatching(/UPDATE llm_adapter_configs SET/)[0];
    expect(update.params.some((p) => typeof p === "string" && p.startsWith("enc:v1:"))).toBe(true);
    expect(update.params.some((p) => typeof p === "string" && p.includes("AIza-new-key"))).toBe(false);
    expect(update.params).toContain("{}");
  });

  it("updateConfig từ chối trường lạ", async () => {
    await expect(new MultiLLMAdapterService(configDb() as any, deps(() => geminiOk("x"))).updateConfig(WS, { evil: true })).rejects.toMatchObject({ statusCode: 422 });
  });

  it("ping là request thật: lỗi 401 báo auth, không giả 'thành công'", async () => {
    process.env.GEMINI_API_KEY = "bad";
    const res = await new MultiLLMAdapterService(configDb() as any, deps(() => jsonResponse(401, { error: "API key not valid" }))).pingProvider(WS, "gemini");
    expect(res).toMatchObject({ status: "error", error_kind: "auth" });
  });
});

describe("tiện ích", () => {
  it("cooldown: quota 15 phút, rate limit theo Retry-After", () => {
    expect(cooldownMsFor(new LlmProviderError("gemini", "quota", "q"))).toBe(15 * 60_000);
    expect(cooldownMsFor(new LlmProviderError("gemini", "rate_limited", "r", 429, 30_000))).toBe(30_000);
  });
  it("parseJsonReply chịu được ```json fence và chữ thừa", () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('Đây là kết quả: {"b":2} cảm ơn')).toEqual({ b: 2 });
  });
});
