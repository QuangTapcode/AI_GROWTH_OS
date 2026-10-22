"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function LoginHeroPanel() {
  const { language, t } = useLanguage();

  return (
    <div className="relative flex-1 hidden lg:flex flex-col justify-between overflow-hidden min-h-screen p-8 xl:p-12 bg-slate-950 select-none">
      {/* Background Hero Image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-85 scale-105 transition-transform duration-1000 ease-out"
        style={{
          backgroundImage: "url('/images/login-hero-bg.jpg')",
        }}
      />

      {/* Ambient Gradient Overlays for contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-slate-950/60 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(37,99,235,0.15),transparent_60%)] pointer-events-none" />

      {/* Floating Metric Cards Area */}
      <div className="relative flex-1 w-full flex items-center justify-center my-4">
        {/* Top-Right SEO Pill */}
        <div className="absolute top-4 right-4 xl:top-6 xl:right-8 bg-white/95 backdrop-blur-md rounded-full px-4 py-2.5 flex items-center gap-2.5 shadow-xl border border-white/80 z-20 animate-float-slow">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="text-xs text-slate-700 font-medium">
            {t.auth.heroSeoScore}: <strong className="font-bold text-slate-900">94.0</strong>
          </span>
          <span className="h-3.5 w-px bg-slate-200" />
          <span className="text-xs text-slate-700 font-medium">
            {t.auth.heroContent}: <strong className="font-bold text-slate-900">92.5</strong>
          </span>
          <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold border border-blue-200">
            ✓
          </span>
        </div>

        {/* Growth Target Floating Card (Top Left) */}
        <div className="absolute top-[10%] left-[4%] xl:left-[8%] bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/80 w-52 z-30 animate-float-slow">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase block mb-1.5">
            {t.auth.heroGrowthTarget}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              +50%
            </span>
            <div className="relative w-11 h-11">
              <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="3.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3.5"
                  strokeDasharray="88"
                  strokeDashoffset="26"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <span className="text-xs text-slate-600 font-medium block mt-2">
            {t.auth.heroQualifiedTraffic}
          </span>
        </div>

        {/* Main Center Chart Card */}
        <div className="relative bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/80 w-[440px] xl:w-[480px] z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              {t.auth.heroOnTrack}
            </span>
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 cursor-pointer hover:text-slate-700 transition-colors">
              {t.auth.heroMonthly}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </span>
          </div>

          <p className="text-xs text-slate-500 font-medium mb-4">
            {language === "vi"
              ? "Phân khúc Sân bay Đà Nẵng · Mục tiêu: 63.240 lượt truy cập"
              : "Da Nang Airport Segment · Target: 63,240 visits"}
          </p>

          {/* Floating Tooltip above highest chart point */}
          <div className="absolute top-[52px] right-[50px] xl:right-[65px] bg-slate-900 text-white rounded-xl px-3 py-1.5 text-center shadow-xl border border-slate-700/80 z-20">
            <span className="text-xs font-extrabold block leading-tight">
              {language === "vi" ? "63.240 lượt" : "63,240 visits"}
            </span>
            <span className="text-[10.5px] text-emerald-400 font-semibold block leading-tight mt-0.5">
              {language === "vi" ? "+52.4% so với mốc chuẩn" : "+52.4% vs baseline"}
            </span>
            <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 absolute -bottom-1 right-7 border-r border-b border-slate-700/80" />
          </div>

          {/* Chart SVG */}
          <div className="w-full">
            <svg viewBox="0 0 320 130" className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="chartBlueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="28" y1="20" x2="310" y2="20" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="28" y1="45" x2="310" y2="45" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="28" y1="70" x2="310" y2="70" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="28" y1="95" x2="310" y2="95" stroke="#f1f5f9" strokeWidth="1" />

              {/* Y Axis Labels */}
              <text x="5" y="24" fill="#94a3b8" fontSize="10" fontWeight="600">60K</text>
              <text x="5" y="49" fill="#94a3b8" fontSize="10" fontWeight="600">45K</text>
              <text x="5" y="74" fill="#94a3b8" fontSize="10" fontWeight="600">30K</text>
              <text x="5" y="99" fill="#94a3b8" fontSize="10" fontWeight="600">15K</text>
              <text x="18" y="120" fill="#94a3b8" fontSize="10" fontWeight="600">0</text>

              {/* X Axis Labels */}
              <text x="45" y="122" fill="#94a3b8" fontSize="10" fontWeight="600" textAnchor="middle">
                {language === "vi" ? "Th1" : "Jan"}
              </text>
              <text x="110" y="122" fill="#94a3b8" fontSize="10" fontWeight="600" textAnchor="middle">
                {language === "vi" ? "Th2" : "Feb"}
              </text>
              <text x="175" y="122" fill="#94a3b8" fontSize="10" fontWeight="600" textAnchor="middle">
                {language === "vi" ? "Th3" : "Mar"}
              </text>
              <text x="240" y="122" fill="#94a3b8" fontSize="10" fontWeight="600" textAnchor="middle">
                {language === "vi" ? "Th4" : "Apr"}
              </text>

              {/* Area Fill */}
              <path
                d="M40 98 C 80 92, 120 78, 175 70 C 220 62, 250 35, 290 24 L 290 115 L 40 115 Z"
                fill="url(#chartBlueGradient)"
              />

              {/* Main Curve Line */}
              <path
                d="M40 98 C 80 92, 120 78, 175 70 C 220 62, 250 35, 290 24"
                fill="none"
                stroke="#2563eb"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Points */}
              <circle cx="175" cy="70" r="4" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="235" cy="48" r="4" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="290" cy="24" r="5.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
            </svg>
          </div>
        </div>

        {/* Organic Traffic Floating Card (Bottom Right) */}
        <div className="absolute bottom-[10%] right-[4%] xl:right-[8%] bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/80 w-56 z-30 animate-float-reverse">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase block mb-1">
            {language === "vi" ? "LƯU LƯỢNG TỰ NHIÊN" : "ORGANIC TRAFFIC"}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              190
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              +30.9%
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium block mt-1">
            {language === "vi" ? "so với hôm trước" : "vs prev day"}
          </span>
          <div className="mt-3 h-8 w-full">
            <svg className="w-full h-full" viewBox="0 0 100 28" fill="none">
              <path
                d="M0 24 C 20 22, 35 25, 50 18 C 65 11, 75 16, 95 6"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Hero Text Overlay */}
      <div className="relative max-w-md mx-auto text-center z-10 pb-2">
        <h2 className="text-2xl font-extrabold text-white tracking-tight mb-1.5">
          AI Growth OS
        </h2>
        <p className="text-sm font-medium text-slate-200 mb-1">
          {language === "vi"
            ? "Biến dữ liệu tăng trưởng thành cơ hội hành động thực tế."
            : "Turn growth data into actionable opportunities."}
        </p>
        <p className="text-xs text-slate-400 leading-relaxed mb-4 max-w-sm mx-auto">
          {t.auth.heroQuote}
        </p>
        <div className="inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-full px-4 py-1.5 text-xs text-slate-300 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
          <span>
            {language === "vi" ? "Không gian làm việc: " : "Workspace: "}
            <strong className="font-semibold text-white">TripC Da Nang</strong> · {t.sidebar.active}
          </span>
        </div>
      </div>
    </div>
  );
}
