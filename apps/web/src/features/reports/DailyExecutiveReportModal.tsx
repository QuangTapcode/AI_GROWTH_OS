'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface DailyReportData {
  generated_at: string;
  date_str: string;
  metrics: {
    posts_published_today: number;
    tiktok_videos_rendered: number;
    comments_replied_count: number;
    comment_sla_minutes: number;
    gmaps_average_rating: number;
    gmaps_reviews_replied_percent: number;
    new_booking_leads_count: number;
    total_party_guests: number;
    community_new_members: number;
    wallet_balance_credits: number;
    wallet_balance_vnd: number;
  };
  executive_summary_markdown: string;
}

interface DailyExecutiveReportModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DailyExecutiveReportModal({ workspaceId, isOpen, onClose }: DailyExecutiveReportModalProps) {
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    async function fetchReport() {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/reports/daily-executive`);
        const json = await res.json();
        if (json.ok && json.report) {
          setReport(json.report);
        }
      } catch {
        // Ignored
      } finally {
        setIsLoading(false);
      }
    }
    fetchReport();
  }, [workspaceId, isOpen]);

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.executive_summary_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl">📊</div>
            <div>
              <h3 className="font-bold text-base">Báo Cáo Điều Hành Ngày (Daily Executive Report)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Tổng hợp kết quả vận hành tự động 24/7 của Đội ngũ 8 AI Agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">Đang tổng hợp dữ liệu từ 8 AI Agent...</div>
          ) : report ? (
            <>
              {/* Metrics Highlights */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100">
                  <div className="text-[11px] font-bold text-blue-700 uppercase">Bài Xuất Bản</div>
                  <div className="text-xl font-black text-blue-950 mt-1">
                    {report.metrics.posts_published_today} bài
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">+1 Video TikTok</div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase">Phản Hồi Comment</div>
                  <div className="text-xl font-black text-emerald-950 mt-1">
                    {report.metrics.comments_replied_count} lượt
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">SLA: {report.metrics.comment_sla_minutes}m</div>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
                  <div className="text-[11px] font-bold text-amber-700 uppercase">Leads & Tư Vấn 1-1</div>
                  <div className="text-xl font-black text-amber-950 mt-1">
                    {report.metrics.new_booking_leads_count} leads
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">AI tự động chốt ({report.metrics.total_party_guests} khách)</div>
                </div>

                <div className="p-3 rounded-2xl bg-purple-50 border border-purple-100">
                  <div className="text-[11px] font-bold text-purple-700 uppercase">Đánh Giá Maps</div>
                  <div className="text-xl font-black text-purple-950 mt-1">
                    {report.metrics.gmaps_average_rating} ★
                  </div>
                  <div className="text-[10px] text-purple-700 mt-0.5">{report.metrics.gmaps_reviews_replied_percent}% trả lời tự động</div>
                </div>
              </div>

              {/* Text format for Telegram/Email */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Bản Tin Điều Hành Tự Động (Gửi Telegram / Email Hàng Ngày)
                  </label>
                  <button
                    onClick={handleCopy}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {copied ? '✓ Đã sao chép' : '📋 Sao chép nội dung'}
                  </button>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {report.executive_summary_markdown}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

