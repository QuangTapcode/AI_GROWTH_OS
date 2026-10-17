import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard · TripC Da Nang | AI Growth OS",
  description:
    "Workspace dashboard for AI Growth OS - manage goals, research, and workflows.",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white shadow-sm shadow-sky-500/20">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">
              AI Growth OS
            </span>
          </Link>

          {/* Workspace Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200/80 text-xs text-slate-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Workspace: <strong>TripC Da Nang</strong></span>
          </div>
        </div>

        {/* Right Actions & User Profile */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center border border-sky-200">
              TC
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-slate-800 leading-none">
                Admin User
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                tripc.danang@gmail.com
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="text-xs font-medium text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-all"
          >
            Đăng xuất
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 rounded-2xl p-6 md:p-8 text-white shadow-lg shadow-sky-500/15 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1 text-xs font-medium mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              Hệ thống AI Growth OS sẵn sàng
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Chào mừng bạn đến với Dashboard!
            </h1>
            <p className="text-sky-100 text-sm mt-1 max-w-xl">
              Bạn đã đăng nhập thành công. Không gian làm việc của TripC Da Nang đã được kích hoạt để bắt đầu các chiến dịch tăng trưởng.
            </p>
          </div>

          <div className="flex gap-3 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-xl bg-white text-sky-700 font-semibold text-xs hover:bg-sky-50 shadow-sm transition-all"
            >
              Về trang đăng nhập
            </Link>
          </div>
        </div>

        {/* Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Qualified Traffic
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                63,240
              </span>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                +52.4%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">vs baseline mục tiêu</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                SEO Score
              </span>
              <span className="w-2 h-2 rounded-full bg-sky-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                94.0
              </span>
              <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                Tối ưu cao
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Content Index: 92.5</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Organic Traffic
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                190
              </span>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                +30.9%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">vs ngày trước đó</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Growth Target
              </span>
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                +50%
              </span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                On Track
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Đang đúng tiến độ Q4</p>
          </div>
        </div>

        {/* Modules Roadmap Grid */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Phân hệ AI Growth OS
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Các module sẵn sàng tiếp tục phát triển theo kế hoạch sprint
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/30 transition-all">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-sm mb-3">
                01
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Workspace & Profile
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Quản lý thông tin doanh nghiệp TripC, địa điểm và danh mục tour/dịch vụ.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/30 transition-all">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-sm mb-3">
                02
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                AI Context & Knowledge Base
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tài liệu huấn luyện RAG, approved facts và đối thủ cạnh tranh.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/30 transition-all">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-sm mb-3">
                03
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Growth Goals & Approval Queue
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Mục tiêu tăng trưởng, phê duyệt bài viết và phân phối nội dung đa kênh.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
