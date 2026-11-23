'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface AgentRosterItem {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'ready' | 'working';
}

interface ZeroTechOnboardingProps {
  workspaceId: string;
  onCompleted?: () => void;
}

const DEFAULT_AGENTS: AgentRosterItem[] = [
  { id: 'agent_1', name: 'growth_lead', role: 'Executive Lead & Daily Report', status: 'active' },
  { id: 'agent_2', name: 'asset_manager', role: 'Drive Asset Ingestion (Gemini Vision)', status: 'active' },
  { id: 'agent_3', name: 'content_planner', role: 'Multi-Channel Content Planner', status: 'active' },
  { id: 'agent_4', name: 'publisher', role: 'Multi-Channel Publisher & TikTok Video', status: 'active' },
  { id: 'agent_5', name: 'gmaps_specialist', role: 'Google Maps Specialist (SEO Local & Reviews)', status: 'active' },
  { id: 'agent_6', name: 'comment_reply', role: 'Social Comment Reply 24/7 (SLA < 3m)', status: 'active' },
  { id: 'agent_7', name: 'inbox_concierge', role: 'Omnichannel Inbox & Lead Concierge (1-on-1 CRM)', status: 'active' },
  { id: 'agent_8', name: 'community_growth', role: 'Community Funnel (0 -> 1.000 Members)', status: 'active' },
];

const DEFAULT_WELCOME =
  'Xin chào! Tôi là AI Growth Lead — Trưởng nhóm điều phối Phòng Marketing AI Tự Hành của doanh nghiệp bạn. Đội ngũ 8 AI Agent chuyên trách đã kết nối trực tiếp với Fanpage, Google Maps, Kho tư liệu Drive và Group Cộng đồng để vận hành tự động 24/7 mà con người không cần can thiệp thủ công.';

export function ZeroTechOnboarding({ workspaceId, onCompleted }: ZeroTechOnboardingProps) {
  const [fanpageUrl, setFanpageUrl] = useState('https://www.facebook.com/profile.php?id=61596152213281');
  const [gmapsUrl, setGmapsUrl] = useState('https://www.google.com/maps/search/?api=1&query=Da+Nang+Vietnam');
  const [gdriveUrl, setGdriveUrl] = useState('https://drive.google.com/drive/folders/tripc-vietnam-playbook-assets');
  const [groupUrl, setGroupUrl] = useState('https://www.facebook.com/groups/1134282109069209');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME);
  const [agents, setAgents] = useState<AgentRosterItem[]>(DEFAULT_AGENTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/onboarding`);
        const json = await res.json();
        if (json.ok && json.state) {
          if (json.state.fanpage_url) setFanpageUrl(json.state.fanpage_url);
          if (json.state.gmaps_url) setGmapsUrl(json.state.gmaps_url);
          if (json.state.gdrive_url) setGdriveUrl(json.state.gdrive_url);
          if (json.state.community_group_url) setGroupUrl(json.state.community_group_url);
          setIsCompleted(json.state.onboarding_completed);
          setWelcomeMessage(json.state.welcome_message);
          setAgents(json.state.active_agents || []);
        }
      } catch {
        // Fallback
      }
    }
    loadStatus();
  }, [workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fanpage_url: fanpageUrl,
          gmaps_url: gmapsUrl,
          gdrive_url: gdriveUrl,
          community_group_url: groupUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Lỗi khi kích hoạt phòng Marketing AI');
      }

      setIsCompleted(true);
      setWelcomeMessage(json.state.welcome_message);
      setAgents(json.state.active_agents || []);
      if (onCompleted) onCompleted();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu thông tin');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-2xl">
            🔗
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Trung Tâm Kết Nối Kênh & Dữ Liệu Marketing</h2>
            <p className="text-sm text-blue-200 mt-1">
              Liên kết Fanpage, Google Maps, Kho ảnh Drive và Group cộng đồng để đội ngũ AI tự động vận hành.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {isCompleted && (
          <div className="mb-6 p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎩</span>
              <div>
                <h4 className="font-bold text-emerald-900 text-base">Thông Điệp Từ AI Growth Lead:</h4>
                <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{welcomeMessage}</p>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Đội ngũ 8 AI Agent đang túc trực 24/7 và giám sát đa kênh
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                1. Link Fanpage Facebook
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-blue-600 font-bold">f</span>
                <input
                  type="url"
                  required
                  placeholder="https://facebook.com/ten-thuong-hieu"
                  value={fanpageUrl}
                  onChange={(e) => setFanpageUrl(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                2. Link Google Maps / Business Profile
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-rose-600 font-bold">📍</span>
                <input
                  type="url"
                  required
                  placeholder="https://maps.app.goo.gl/..."
                  value={gmapsUrl}
                  onChange={(e) => setGmapsUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                3. Link Google Drive Ảnh Chụp Thực Tế (Tour, Cảnh Sắc, Dịch Vụ)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-amber-500 font-bold">📁</span>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={gdriveUrl}
                  onChange={(e) => setGdriveUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                4. Link Group Facebook / Zalo Cộng Đồng (Tùy chọn)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-teal-600 font-bold">👥</span>
                <input
                  type="url"
                  placeholder="https://facebook.com/groups/..."
                  value={groupUrl}
                  onChange={(e) => setGroupUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Xem Trước Bản Đồ Google Maps Trực Quan */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">🗺️</span>
                <span className="text-xs font-bold text-slate-800">
                  Xem Trước Vị Trí Google Maps & Địa Điểm Đã Ghim:
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Live Map Active
                </span>
              </div>
              <a
                href="/gmaps"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
              >
                Mở trung tâm Agent 5: Maps & Drive đầy đủ →
              </a>
            </div>

            <div className="w-full h-52 rounded-xl overflow-hidden border border-slate-300 shadow-inner bg-slate-100">
              <iframe
                title="Google Maps Onboarding Preview"
                src="https://maps.google.com/maps?q=B%C3%A3i+bi%E1%BB%83n+M%E1%BB%B9+Kh%C3%AA+%C4%90%C3%A0+N%E1%BA%B5ng&t=&z=14&ie=UTF8&iwloc=&output=embed"
                className="w-full h-full border-0"
                loading="lazy"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Chỉ cần nhập link công khai. Không cần nhập mật khẩu hay cấu hình phức tạp.
            </span>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? 'Đang lưu...' : isCompleted ? 'Lưu & Cập Nhật Kênh' : 'Kích Hoạt Kết Nối Kênh'}
            </button>
          </div>
        </form>

        {/* 8 Agents Status Roster */}
        {agents.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Đội Ngũ 8 AI Agent Chuyên Trách & Giao Diện Hoạt Động
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Bấm vào từng Agent để mở trực tiếp trung tâm điều khiển và giao diện làm việc tương ứng.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full w-fit">
                ● 8/8 Agent sẵn sàng
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {agents.map((agent) => {
                const AGENT_WORKSPACE_ROUTES: Record<string, { href: string; label: string; icon: string; desc: string }> = {
                  growth_lead: {
                    href: '/agents/growth_lead',
                    label: 'Mở Agent 1: Growth Lead',
                    icon: '🎩',
                    desc: 'Trưởng nhóm AI: Điều phối chiến lược, chấm điểm cơ hội & Báo cáo điều hành ngày',
                  },
                  asset_manager: {
                    href: '/gmaps?tab=drive_assets',
                    label: 'Mở Agent 2: Drive & Vision',
                    icon: '📁',
                    desc: 'Tự động quét kho ảnh Google Drive định kỳ & phân tích bối cảnh bằng Gemini Vision',
                  },
                  content_planner: {
                    href: '/agents/content',
                    label: 'Mở Agent 3: Content Planner',
                    icon: '✍️',
                    desc: 'Nghiên cứu xu hướng thị trường, viết bài SEO & lập Content Calendar đa kênh',
                  },
                  publisher: {
                    href: '/distribution',
                    label: 'Mở Agent 4: Auto-Publisher',
                    icon: '🚀',
                    desc: 'Tự động xuất bản bài viết & dựng video ngắn 9:16 lên Facebook, Website, Maps, TikTok',
                  },
                  gmaps_specialist: {
                    href: '/gmaps',
                    label: 'Mở Agent 5: Google Maps SEO',
                    icon: '📍',
                    desc: 'Quản lý Google Business Profile, tự động đăng Local Post & phản hồi 100% Review',
                  },
                  comment_reply: {
                    href: '/agents/community#comments',
                    label: 'Mở Agent 6: Comment Reply 24/7',
                    icon: '💬',
                    desc: 'Túc trực 24/7 tự động trả lời 100% comment công khai (SLA < 3 phút) bằng RAG',
                  },
                  inbox_concierge: {
                    href: '/booking-leads',
                    label: 'Mở Agent 7: Inbox & Lead CRM',
                    icon: '🛎️',
                    desc: 'Trợ lý tư vấn hội thoại 1-1 tự động trên Messenger/Telegram/Web & thu thập Lead',
                  },
                  community_growth: {
                    href: '/agents/community',
                    label: 'Mở Agent 8: Community Growth',
                    icon: '👥',
                    desc: 'Vận hành Group Cộng đồng, thảo luận hàng ngày & tự động mời thành viên theo xu hướng',
                  },
                };

                const meta = AGENT_WORKSPACE_ROUTES[agent.name] || {
                  href: '/agents',
                  label: 'Mở Agent',
                  icon: '🤖',
                  desc: agent.role,
                };

                return (
                  <div
                    key={agent.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl p-1.5 rounded-xl bg-slate-100 group-hover:bg-blue-50 transition-colors shrink-0">
                            {meta.icon}
                          </span>
                          <span className="text-xs font-bold text-slate-800 font-mono truncate">
                            {agent.name}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            agent.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {agent.status === 'active' ? 'Hoạt động' : 'Sẵn sàng'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium line-clamp-2 leading-relaxed">
                        {meta.desc}
                      </p>
                    </div>

                    <a
                      href={meta.href}
                      className="mt-3.5 w-full py-1.5 px-3 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white flex items-center justify-between transition-all"
                    >
                      <span>{meta.label}</span>
                      <span>→</span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

