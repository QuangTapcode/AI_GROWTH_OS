'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

export interface BookingLeadItem {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  platform: 'messenger' | 'instagram' | 'web' | 'telegram' | 'zalo';
  party_size: number;
  booking_time: string;
  special_notes?: string;
  consultation_summary?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  deposit_amount: number;
  deposit_status?: 'unpaid' | 'partial' | 'paid' | 'refunded';
  created_at: string;
}

interface BookingLeadsHubProps {
  workspaceId: string;
}

export function BookingLeadsHub({ workspaceId }: BookingLeadsHubProps) {
  const [leads, setLeads] = useState<BookingLeadItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState(
    'Chào TripC, nhóm mình 3 người muốn tìm căn hộ dịch vụ gần biển Mỹ Khê Đà Nẵng trong 2 tuần đầu và cần tư vấn thủ tục e-Visa 90 ngày. SĐT mình: 0935888999 (Hoàng Bảo).'
  );
  const [simReply, setSimReply] = useState<string | null>(null);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const url =
        filterStatus === 'all'
          ? `${API_BASE_URL}/workspaces/${workspaceId}/booking/leads`
          : `${API_BASE_URL}/workspaces/${workspaceId}/booking/leads?status=${filterStatus}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok && Array.isArray(json.leads)) {
        setLeads(json.leads);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [workspaceId, filterStatus]);

  const updateLeadStatus = async (leadId: string, status: string, depositStatus?: string) => {
    setIsUpdating(leadId);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/booking/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(depositStatus ? { deposit_status: depositStatus } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? json.lead : l)));
      }
    } catch {
      // Error handling
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSimulateAutonomousInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessage.trim()) return;
    setIsSimulating(true);
    setSimReply(null);
    try {
      const phoneMatch = simMessage.match(/(0\d{8,10}|\+?\d{9,12})/);
      const sizeMatch = simMessage.match(/(\d+)\s*(người|khách|member|people)/i);
      const nameMatch = simMessage.match(/\(([^)]+)\)/);
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/booking/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_reply_and_capture',
          customer_message: simMessage,
          customer_name: nameMatch ? nameMatch[1] : 'Khách Tương Tác Messenger (Auto-Captured)',
          customer_phone: phoneMatch ? phoneMatch[1] : '0905888999',
          platform: 'messenger',
          party_size: sizeMatch ? Number(sizeMatch[1]) : 2,
          special_notes: simMessage,
          status: 'confirmed',
        }),
      });
      const json = await res.json();
      if (json.ok) {
        if (json.reply) setSimReply(json.reply);
        await fetchLeads();
      }
    } catch {
      // Ignored
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-0">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛎️</span>
            <h3 className="text-lg font-bold">
              Agent 7: Omnichannel Inbox & Lead Concierge (Tư Vấn 1-1 & Chuyển Đổi Tự Hành 24/7)
            </h3>
          </div>
          <p className="text-xs text-blue-200 mt-1 max-w-3xl">
            Hệ thống AI tự động trực hộp thư Messenger, Telegram, Instagram & Webchat 24/7 — tự động tư vấn đa lượt dựa trên kho tri thức doanh nghiệp (RAG), trích xuất nhu cầu & thông tin liên hệ và tự động chốt khách hàng tiềm năng (Leads) mà con người không cần trực chat.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Auto-Concierge 24/7: ĐANG BẬT (SLA &lt; 45s)
          </span>
        </div>
      </div>

      {/* Autonomous Inbox Simulation & Live Test Strip */}
      <div className="p-5 bg-blue-50/50 border-b border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <span>🤖</span> Luồng AI Tự Động Trực Hộp Thư 1-1 & Trích Xuất Lead (Zero-Touch Pipeline)
            </h4>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Khi khách nhắn tin vào Fanpage / Telegram / Website, Agent 7 tự động phản hồi ngay lập tức và tự động lưu hồ sơ Lead xuống bên dưới.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất Cả Trạng Thái ({leads.length})</option>
              <option value="confirmed">AI Đã Tư Vấn & Chốt Lead</option>
              <option value="pending">AI Đang Tư Vấn 1-1</option>
              <option value="cancelled">Đã Lưu Trữ</option>
            </select>

            <button
              onClick={fetchLeads}
              disabled={isLoading}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
            >
              {isLoading ? 'Đang đồng bộ...' : 'Làm mới'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSimulateAutonomousInbox} className="flex flex-col md:flex-row gap-2.5">
          <input
            type="text"
            value={simMessage}
            onChange={(e) => setSimMessage(e.target.value)}
            placeholder="Nhập tin nhắn khách hàng gửi vào Inbox để kiểm thử Agent 7 tự động trả lời & bắt Lead..."
            className="flex-1 text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isSimulating}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isSimulating ? 'AI Agent 7 đang xử lý...' : '⚡ Chạy AI Tư Vấn 1-1 & Tự Động Bắt Lead'}
          </button>
        </form>

        {simReply && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
            <div className="font-bold text-emerald-800 flex items-center gap-1.5">
              <span>✓</span> Phản hồi 1-1 của AI Agent 7 đã tự động gửi cho khách & trích xuất Lead vào hệ thống:
            </div>
            <p className="leading-relaxed">{simReply}</p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-100/70 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-bold">
            <tr>
              <th className="py-3 px-4">Khách Hàng & Liên Hệ</th>
              <th className="py-3 px-3">Kênh Inbox</th>
              <th className="py-3 px-3">Quy Mô</th>
              <th className="py-3 px-4">Thời Gian Tương Tác</th>
              <th className="py-3 px-4">Nhu Cầu & Tín Hiệu Khách Hàng</th>
              <th className="py-3 px-4">Kịch Bản AI Agent 7 Đã Tư Vấn</th>
              <th className="py-3 px-3">Trạng Thái AI</th>
              <th className="py-3 px-4 text-right">Cập Nhật Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  Chưa có khách hàng tiềm năng nào trong bộ lọc này.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const dateObj = new Date(lead.booking_time);
                const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

                return (
                  <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{lead.customer_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {lead.customer_phone ? (
                          <a href={`tel:${lead.customer_phone}`} className="text-blue-600 hover:underline">
                            📞 {lead.customer_phone}
                          </a>
                        ) : (
                          'Tự động định danh qua Inbox'
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                        {lead.platform}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-800 text-sm">{lead.party_size}</span> người
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{timeStr}</div>
                      <div className="text-[11px] text-slate-500">{dateStr}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="max-w-[240px] text-slate-700 leading-snug" title={lead.special_notes}>
                        {lead.special_notes || 'Tư vấn thông tin dịch vụ & lộ trình'}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="max-w-[260px] text-emerald-800 bg-emerald-50/60 border border-emerald-200/70 rounded-lg p-2 text-[11px] leading-snug">
                        🤖 {lead.consultation_summary || 'AI Agent 7 đã tự động tư vấn 1-1 theo kho tri thức RAG và chốt thông tin liên hệ.'}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          lead.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : lead.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {lead.status === 'confirmed'
                          ? '✓ AI Đã Chốt Lead'
                          : lead.status === 'pending'
                          ? '● AI Đang Tư Vấn'
                          : 'Đã Lưu Trữ'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {lead.status !== 'confirmed' && (
                          <button
                            disabled={isUpdating === lead.id}
                            onClick={() => updateLeadStatus(lead.id, 'confirmed')}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                          >
                            Xác Nhận Lead
                          </button>
                        )}
                        {lead.status !== 'cancelled' && (
                          <button
                            disabled={isUpdating === lead.id}
                            onClick={() => updateLeadStatus(lead.id, 'cancelled')}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            Lưu Trữ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
