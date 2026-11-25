/**
 * QA (Thiệu): giả lập Gemini cạn hạn mức (HTTP 429 RESOURCE_EXHAUSTED) để kiểm tra Auto-Switch sang DeepSeek
 * bằng HTTP thật (không mock fetch). Chạy: npx tsx scripts/qa/simulate-gemini-429.ts
 *
 * - Dựng 1 server cục bộ đóng vai Gemini (luôn 429) và DeepSeek (OpenAI-compatible, trả lời bình thường).
 * - Trỏ GEMINI_BASE_URL / DEEPSEEK_BASE_URL về server đó, gọi router 5 lần như agent thật.
 * - Kỳ vọng: lần 1 thử Gemini → 429 → chuyển DeepSeek trong cùng request; lần 2–5 bỏ qua Gemini (đang cooldown)
 *   nên đi thẳng DeepSeek; không request nào thất bại; mỗi lần đều có nhật ký usage.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { MultiLLMAdapterService } from "../../src/modules/ai/llmAdapter";

const WS = "00000000-0000-4000-8000-0000000000aa";

async function main() {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url?.startsWith("/gemini/")) {
        hits.push("gemini:429");
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Generate Content API requests per minute'", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "45s" }] } }));
        return;
      }
      if (req.url === "/deepseek/chat/completions") {
        const parsed = JSON.parse(body || "{}");
        hits.push(`deepseek:200 model=${parsed.model}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ model: "deepseek-chat", choices: [{ message: { content: "Dạ quán cảm ơn anh/chị đã ghé, hẹn gặp lại ạ!" }, finish_reason: "stop" }] }));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    GEMINI_BASE_URL: `${base}/gemini`,
    DEEPSEEK_BASE_URL: `${base}/deepseek`,
    GEMINI_API_KEY: "qa-gemini-key",
    DEEPSEEK_API_KEY: "qa-deepseek-key",
  });
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  // DB trong bộ nhớ: giữ cooldown giữa các lần gọi như Postgres thật.
  const state = { cooldowns: {} as Record<string, string>, provider_status: {} as Record<string, string>, usage: 0 };
  const db = {
    async query(sql: string, params: unknown[] = []) {
      if (/INSERT INTO llm_adapter_configs/.test(sql)) {
        return { rows: [{ workspace_id: WS, primary_provider: "gemini", auto_switch_enabled: true, fallback_order: ["gemini", "deepseek", "openai", "claude"], cooldowns: state.cooldowns, provider_status: state.provider_status }] };
      }
      if (/cooldowns \|\| jsonb_build_object|cooldowns - \$2/.test(sql)) {
        const [, provider, status, until] = params as string[];
        state.provider_status[provider] = status;
        if (until) state.cooldowns[provider] = until;
        else delete state.cooldowns[provider];
        return { rows: [] };
      }
      if (/INSERT INTO llm_usage_events/.test(sql)) state.usage++;
      return { rows: [] };
    },
  };

  const router = new MultiLLMAdapterService(db as never);
  const results = [];
  for (let i = 1; i <= 5; i++) {
    const r = await router.generate(WS, { agent: "comment_reply", prompt: `Bình luận #${i}: quán ngon quá` });
    results.push({ request: i, provider: r.provider_used, switched_from: r.switched_from ?? "-", attempts: r.attempts.map((a) => `${a.provider}:${a.ok ? "ok" : a.error_kind}`).join(" → "), latency_ms: r.latency_ms });
  }
  await new Promise<void>((r) => server.close(() => r()));

  console.log("\n=== QA: Gemini 429 → Auto-Switch ===");
  console.table(results);
  console.log("HTTP thật tới server giả lập:", hits.join(" | "));
  console.log("Cooldown Gemini tới:", state.cooldowns.gemini ?? "(không có)");
  console.log("Số bản ghi llm_usage_events:", state.usage);

  const ok =
    results.every((r) => r.provider === "deepseek") &&
    results[0].switched_from === "gemini" &&
    results.slice(1).every((r) => !r.attempts.includes("gemini")) &&
    hits.filter((h) => h.startsWith("gemini")).length === 1 &&
    Boolean(state.cooldowns.gemini);
  console.log(ok ? "\nKẾT QUẢ: PASS — không request nào thất bại; Gemini bị tạm ngưng sau lỗi 429 đầu tiên." : "\nKẾT QUẢ: FAIL");
  process.exitCode = ok ? 0 : 1;
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
