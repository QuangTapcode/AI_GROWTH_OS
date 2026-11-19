'use client';

import React, { useState, useEffect } from 'react';

export interface BookingLeadItem {
  id: string;
  customer_name: string;
  customer_phone?: string;
  platform: 'messenger' | 'instagram' | 'web' | 'telegram' | 'zalo';
  party_size: number;
  booking_time: string;
  special_notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  deposit_amount: number;
  deposit_status: 'unpaid' | 'partial' | 'paid' | 'refunded';
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

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const url =
        filterStatus === 'all'
          ? `/v1/workspaces/${workspaceId}/booking/leads`
          : `/v1/workspaces/${workspaceId}/booking/leads?status=${filterStatus}`;
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
      const res = await fetch(`/v1/workspaces/${workspaceId}/booking/leads/${leadId}`, {
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🛎️</span>
            <h3 className="text-lg font-bold text-slate-900">
              Agent 7: Omnichannel Inbox & Lead Concierge — Khách Hàng Tiềm Năng & Lịch Hẹn (1-1)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tự động phản hồi tin nhắn riêng tư (Inbox), tư vấn sản phẩm/dịch vụ và thu thập thông tin khách hàng tiềm năng qua Messenger, Instagram, Website 24/7.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất Cả Trạng Thái</option>
            <option value="confirmed">Đã Xác Nhận</option>
            <option value="pending">Chờ Xử Lý</option>
            <option value="cancelled">Đã Huỷ</option>
          </select>

          <button
            onClick={fetchLeads}
            disabled={isLoading}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
          >
            {isLoading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-100/70 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-bold">
            <tr>
              <th className="py-3 px-4">Khách Hàng</th>
              <th className="py-3 px-3">Kênh</th>
              <th className="py-3 px-3">Số Khách</th>
              <th className="py-3 px-4">Thời Gian Ghé Quán</th>
              <th className="py-3 px-4">Ghi Chú Đặt Bàn</th>
              <th className="py-3 px-3">Trạng Thái</th>
              <th className="py-3 px-4 text-right">Thao Tác Quán</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">
                  Chưa có đơn đặt bàn nào trong mục này.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const dateObj = new Date(lead.booking_time);
                const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

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
                          'Chưa để lại SĐT'
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {lead.platform}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-800 text-sm">{lead.party_size}</span> khách
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{timeStr}</div>
                      <div className="text-[11px] text-slate-500">{dateStr}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="max-w-[200px] truncate text-slate-700" title={lead.special_notes}>
                        {lead.special_notes || '—'}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          lead.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : lead.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {lead.status === 'confirmed'
                          ? 'Đã Giữ Bàn'
                          : lead.status === 'pending'
                          ? 'Đang Tư Vấn'
                          : 'Đã Huỷ'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {lead.status !== 'confirmed' && (
                          <button
                            disabled={isUpdating === lead.id}
                            onClick={() => updateLeadStatus(lead.id, 'confirmed')}
                            className="px-2 py-1 rounded text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Xác Nhận
                          </button>
                        )}
                        {lead.deposit_status !== 'paid' && (
                          <button
                            disabled={isUpdating === lead.id}
                            onClick={() => updateLeadStatus(lead.id, lead.status, 'paid')}
                            className="px-2 py-1 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Đã Cọc
                          </button>
                        )}
                        {lead.status !== 'cancelled' && (
                          <button
                            disabled={isUpdating === lead.id}
                            onClick={() => updateLeadStatus(lead.id, 'cancelled')}
                            className="px-2 py-1 rounded text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-rose-100 hover:text-rose-700"
                          >
                            Huỷ
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

