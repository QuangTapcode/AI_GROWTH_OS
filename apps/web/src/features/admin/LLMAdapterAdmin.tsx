'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface LLMConfig {
  workspace_id: string;
  primary_provider: 'gemini' | 'deepseek' | 'openai' | 'claude';
  auto_switch_enabled: boolean;
  gemini_api_key?: string;
  deepseek_api_key?: string;
  openai_api_key?: string;
  claude_api_key?: string;
  active_fallback: string;
  last_switch_at?: string;
  last_switch_reason?: string;
  latency_ms: number;
}

interface LLMAdapterAdminProps {
  workspaceId: string;
}

export function LLMAdapterAdmin({ workspaceId }: LLMAdapterAdminProps) {
  const [config, setConfig] = useState<LLMConfig>({
    workspace_id: workspaceId,
    primary_provider: 'gemini',
    auto_switch_enabled: true,
    gemini_api_key: '',
    deepseek_api_key: '',
    openai_api_key: '',
    claude_api_key: '',
    active_fallback: 'gemini',
    latency_ms: 280,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [pingStatus, setPingStatus] = useState<Record<string, { status: string; latency: number; msg: string }>>({});
  const [isPinging, setIsPinging] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/admin/llm-config`);
        const json = await res.json();
        if (json.ok && json.config) {
          setConfig(json.config);
        }
      } catch {
        // Ignored
      }
    }
    load();
  }, [workspaceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/admin/llm-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.ok) {
        setConfig(json.config);
        setSaveMessage('Đã lưu cấu hình Multi-LLM Adapter thành công!');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  const handlePing = async (provider: string) => {
    setIsPinging(provider);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/admin/llm-config/test-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (json.ok && json.ping) {
        setPingStatus((prev) => ({
          ...prev,
          [provider]: {
            status: json.ping.status,
            latency: json.ping.latency_ms,
            msg: json.ping.message,
          },
        }));
      }
    } catch {
      // Ignored
    } finally {
      setIsPinging(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Banner */}
      <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎛️</span>
            <h3 className="text-lg font-bold">Admin: Multi-LLM Adapter & Auto-Switch Controller</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Bộ điều hợp định tuyến thông minh: Tự động chuyển đổi giữa các API LLM khi chạm hạn mức Rate Limit hoặc hết quota.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Đang phục vụ: {config.active_fallback.toUpperCase()} (Độ trễ ~{config.latency_ms}ms)
        </div>
      </div>

      <div className="p-6">
        {saveMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            ✓ {saveMessage}
          </div>
        )}

        {config.last_switch_reason && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <span>⚠️</span> Nhật ký chuyển đổi gần nhất (Failover Event):
            </div>
            <p className="leading-relaxed">{config.last_switch_reason}</p>
            {config.last_switch_at && (
              <span className="text-[10px] text-amber-700 mt-1 block">
                Thời gian: {new Date(config.last_switch_at).toLocaleString('vi-VN')}
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* General switches */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-slate-800">Cơ chế Tự Động Chuyển Đổi (Auto-Switch Failover)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Khi API chính gặp lỗi HTTP 429 hoặc cạn quota, hệ thống tự động gọi API phụ mà không làm đứt mạch chat.
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.auto_switch_enabled}
                onChange={(e) => setConfig({ ...config, auto_switch_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Providers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gemini */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="font-bold text-sm text-slate-800">Google Gemini (Free / Primary)</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Ưu Tiên Số 1
                </span>
              </div>
              <input
                type="password"
                placeholder="Dùng biến GEMINI_API_KEY hệ thống hoặc nhập key riêng..."
                value={config.gemini_api_key || ''}
                onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {pingStatus['gemini'] ? `Độ trễ: ${pingStatus['gemini'].latency}ms` : 'Miễn phí, tốc độ cao'}
                </span>
                <button
                  type="button"
                  onClick={() => handlePing('gemini')}
                  disabled={isPinging === 'gemini'}
                  className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {isPinging === 'gemini' ? 'Đang test...' : 'Kiểm tra Ping'}
                </button>
              </div>
            </div>

            {/* DeepSeek */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🐋</span>
                  <span className="font-bold text-sm text-slate-800">DeepSeek (Cost-Effective Fallback)</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Dự Phòng 1</span>
              </div>
              <input
                type="password"
                placeholder="sk-deepseek-..."
                value={config.deepseek_api_key || ''}
                onChange={(e) => setConfig({ ...config, deepseek_api_key: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {pingStatus['deepseek'] ? `Độ trễ: ${pingStatus['deepseek'].latency}ms` : 'Chi phí siêu thấp'}
                </span>
                <button
                  type="button"
                  onClick={() => handlePing('deepseek')}
                  disabled={isPinging === 'deepseek'}
                  className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {isPinging === 'deepseek' ? 'Đang test...' : 'Kiểm tra Ping'}
                </button>
              </div>
            </div>

            {/* OpenAI */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <span className="font-bold text-sm text-slate-800">OpenAI (GPT-4o-mini)</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Dự Phòng 2</span>
              </div>
              <input
                type="password"
                placeholder="sk-proj-..."
                value={config.openai_api_key || ''}
                onChange={(e) => setConfig({ ...config, openai_api_key: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {pingStatus['openai'] ? `Độ trễ: ${pingStatus['openai'].latency}ms` : 'Chuẩn mực ngành'}
                </span>
                <button
                  type="button"
                  onClick={() => handlePing('openai')}
                  disabled={isPinging === 'openai'}
                  className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {isPinging === 'openai' ? 'Đang test...' : 'Kiểm tra Ping'}
                </button>
              </div>
            </div>

            {/* Claude */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎭</span>
                  <span className="font-bold text-sm text-slate-800">Anthropic Claude (Haiku / Sonnet)</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Cao Cấp</span>
              </div>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={config.claude_api_key || ''}
                onChange={(e) => setConfig({ ...config, claude_api_key: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {pingStatus['claude'] ? `Độ trễ: ${pingStatus['claude'].latency}ms` : 'Văn phong tự nhiên'}
                </span>
                <button
                  type="button"
                  onClick={() => handlePing('claude')}
                  disabled={isPinging === 'claude'}
                  className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {isPinging === 'claude' ? 'Đang test...' : 'Kiểm tra Ping'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl font-bold text-xs bg-slate-900 text-white hover:bg-black transition-all shadow-md disabled:opacity-60"
            >
              {isLoading ? 'Đang lưu...' : 'Lưu Cấu Hình Multi-LLM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

