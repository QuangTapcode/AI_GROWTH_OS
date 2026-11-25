"use client";

import React, { useState } from "react";
import { merchantApi, type LlmProviderId, type PingResult } from "@/lib/merchantApi";
import { Button, Card, LoadingBlock, Notice, Pill, useAction, useLoader } from "@/features/merchant/ui";

const NAMES: Record<LlmProviderId, string> = { gemini: "Google Gemini", deepseek: "DeepSeek", openai: "OpenAI", claude: "Anthropic Claude" };
const STATUS: Record<string, { tone: "green" | "amber" | "red" | "slate" | "blue"; label: string }> = {
  active: { tone: "green", label: "Đang phục vụ" },
  ready: { tone: "blue", label: "Sẵn sàng" },
  rate_limited: { tone: "amber", label: "Tạm ngưng (quá tải)" },
  error: { tone: "red", label: "Lỗi khóa" },
  not_configured: { tone: "slate", label: "Chưa có khóa" },
};

/** Quản trị Multi-LLM: khóa API (chỉ hiển thị ••••1234), nhà cung cấp chính, thứ tự dự phòng, ping thật. */
export function LLMAdapterAdmin({ workspaceId }: { workspaceId: string }) {
  const { data: config, error, loading, setData } = useLoader(() => merchantApi.llmConfig(workspaceId), [workspaceId]);
  const { busy, notice, setNotice, run } = useAction();
  const [keys, setKeys] = useState<Partial<Record<LlmProviderId, string>>>({});
  const [pings, setPings] = useState<Partial<Record<LlmProviderId, PingResult>>>({});

  if (loading && !config) return <LoadingBlock />;
  if (error && !config) return <Notice notice={{ kind: "error", text: error }} />;
  if (!config) return null;

  const save = (body: Record<string, unknown>, okText: string) =>
    run("save", async () => {
      setData(await merchantApi.updateLlmConfig(workspaceId, body));
      setKeys({});
      return okText;
    });

  const move = (provider: LlmProviderId, delta: number) => {
    const order = [...config.fallback_order];
    const i = order.indexOf(provider);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void save({ fallback_order: order }, "Đã cập nhật thứ tự dự phòng");
  };

  return (
    <div className="space-y-5">
      <Card
        title="Multi-LLM Router & Auto-Switch"
        subtitle="Ưu tiên tầng miễn phí (Gemini). Khi gặp 429, hết quota, timeout hoặc lỗi máy chủ, hệ thống tự chuyển sang nhà cung cấp kế tiếp trong cùng lượt và tạm ngưng nhà cung cấp lỗi."
        actions={
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="w-4 h-4 accent-blue-700"
              checked={config.auto_switch_enabled}
              disabled={busy === "save"}
              onChange={(e) => save({ auto_switch_enabled: e.target.checked }, e.target.checked ? "Đã bật Auto-Switch" : "Đã tắt Auto-Switch")}
            />
            Auto-Switch
          </label>
        }
      >
        <Notice notice={notice} onClose={() => setNotice(null)} />
        {config.last_switch_at && (
          <p className="text-xs text-slate-600 mt-3">
            Lần chuyển gần nhất: <strong>{new Date(config.last_switch_at).toLocaleString("vi-VN")}</strong> — {config.last_switch_reason}
          </p>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Thứ tự</th>
                <th className="py-2 pr-3">Nhà cung cấp</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3">API key</th>
                <th className="py-2">Kiểm tra</th>
              </tr>
            </thead>
            <tbody>
              {config.fallback_order.map((id, index) => {
                const p = config.providers.find((x) => x.provider === id)!;
                const s = STATUS[p.status] ?? STATUS.ready;
                const ping = pings[id];
                return (
                  <tr key={id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="font-bold text-slate-900 mr-2">{index + 1}</span>
                      <button type="button" className="px-1 text-slate-500 disabled:opacity-30" disabled={index === 0 || busy === "save"} onClick={() => move(id, -1)} aria-label={`Đưa ${NAMES[id]} lên`}>
                        ▲
                      </button>
                      <button type="button" className="px-1 text-slate-500 disabled:opacity-30" disabled={index === config.fallback_order.length - 1 || busy === "save"} onClick={() => move(id, 1)} aria-label={`Đưa ${NAMES[id]} xuống`}>
                        ▼
                      </button>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900">
                        {NAMES[id]} {config.primary_provider === id && <Pill tone="blue">Chính</Pill>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {p.model}
                        {!p.supports_images && " · không phân tích ảnh"}
                      </p>
                      {config.primary_provider !== id && p.key_source !== "none" && (
                        <button type="button" className="text-[11px] font-semibold text-blue-700 mt-1" onClick={() => save({ primary_provider: id }, `${NAMES[id]} là nhà cung cấp chính`)}>
                          Đặt làm chính
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      {p.cooldown_until && <p className="text-[11px] text-slate-500 mt-1">đến {new Date(p.cooldown_until).toLocaleTimeString("vi-VN")}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-[11px] text-slate-500 mb-1">
                        {p.key_source === "workspace" ? `Khóa riêng: ${p.key_masked}` : p.key_source === "server_env" ? "Dùng khóa của máy chủ" : "Chưa có khóa"}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder="Dán khóa mới…"
                          aria-label={`API key ${NAMES[id]}`}
                          value={keys[id] ?? ""}
                          onChange={(e) => setKeys((k) => ({ ...k, [id]: e.target.value }))}
                          className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <Button variant="secondary" busy={busy === "save"} disabled={!keys[id]?.trim()} onClick={() => save({ [`${id}_api_key`]: keys[id]!.trim() }, `Đã lưu khóa ${NAMES[id]} (mã hóa)`)}>
                          Lưu
                        </Button>
                        {p.key_source === "workspace" && (
                          <Button variant="danger" busy={busy === "save"} onClick={() => save({ [`${id}_api_key`]: null }, `Đã xóa khóa riêng của ${NAMES[id]}`)}>
                            Xóa
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <Button
                        variant="secondary"
                        busy={busy === `ping-${id}`}
                        disabled={p.key_source === "none"}
                        onClick={() =>
                          run(`ping-${id}`, async () => {
                            const r = await merchantApi.pingLlm(workspaceId, id);
                            setPings((x) => ({ ...x, [id]: r }));
                            setData(await merchantApi.llmConfig(workspaceId));
                          })
                        }
                      >
                        Ping thật
                      </Button>
                      {ping && (
                        <p className={`text-[11px] mt-1 max-w-[220px] ${ping.status === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
                          {ping.status === "ok" ? `OK · ${ping.latency_ms}ms` : `${ping.error_kind ?? "lỗi"}: ${ping.message}`}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-4">
          Khóa được mã hóa AES-256-GCM trước khi lưu và không bao giờ gửi lại trình duyệt. Claude cần gói <code>@anthropic-ai/sdk</code> trên máy chủ API.
        </p>
      </Card>
    </div>
  );
}

export default LLMAdapterAdmin;
