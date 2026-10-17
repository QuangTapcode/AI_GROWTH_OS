"use client";

import React from "react";

export default function LoginHeroPanel() {
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
        <div className="absolute top-4 right-4 xl:top-6 xl:right-8 bg-white/95 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2.5 shadow-2xl border border-white/80 z-20 animate-float-slow">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="text-xs text-slate-700 font-medium">
            SEO Score: <strong className="font-bold text-slate-900">94.0</strong>
          </span>
          <span className="h-3.5 w-px bg-slate-200" />
          <span className="text-xs text-slate-700 font-medium">
            Content: <strong className="font-bold text-slate-900">92.5</strong>
          </span>
          <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold border border-blue-200">
            ✓
          </span>
        </div>

        {/* Growth Target Floating Card (Top Left) */}
        <div className="absolute top-[14%] left-[6%] xl:left-[12%] bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/80 w-44 z-30 animate-float-slow">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block mb-1">
            GROWTH TARGET
          </span>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              +50%
            </span>
            <div className="relative w-9 h-9">
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
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
          <span className="text-xs text-slate-500 font-medium block mt-1">
            Qualified traffic
          </span>
        </div>

        {/* Main Center Chart Card */}
        <div className="relative bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-white/80 w-[380px] xl:w-[420px] z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-100">
              On Track
            </span>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 cursor-pointer hover:text-slate-600 transition-colors">
              Monthly
              <svg
                className="w-3 h-3"
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

          <p className="text-[11px] text-slate-400 font-medium mb-4">
            Da Nang Airport Segment · Target: 63,240 visits
          </p>

          {/* Floating Tooltip above highest chart point */}
          <div className="absolute top-[48px] right-[45px] xl:right-[55px] bg-slate-900 text-white rounded-lg px-2.5 py-1 text-center shadow-xl border border-slate-700/80 z-20">
            <span className="text-xs font-bold block leading-tight">
              63,240 visits
            </span>
            <span className="text-[10px] text-emerald-400 font-medium block leading-tight">
              +52.4% vs baseline
            </span>
            <div className="w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 right-7 border-r border-b border-slate-700/80" />
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
              <text x="5" y="24" fill="#94a3b8" fontSize="9" fontWeight="500">60K</text>
              <text x="5" y="49" fill="#94a3b8" fontSize="9" fontWeight="500">45K</text>
              <text x="5" y="74" fill="#94a3b8" fontSize="9" fontWeight="500">30K</text>
              <text x="5" y="99" fill="#94a3b8" fontSize="9" fontWeight="500">15K</text>
              <text x="18" y="120" fill="#94a3b8" fontSize="9" fontWeight="500">0</text>

              {/* X Axis Labels */}
              <text x="45" y="122" fill="#94a3b8" fontSize="9" fontWeight="500" textAnchor="middle">Jan</text>
              <text x="110" y="122" fill="#94a3b8" fontSize="9" fontWeight="500" textAnchor="middle">Feb</text>
              <text x="175" y="122" fill="#94a3b8" fontSize="9" fontWeight="500" textAnchor="middle">Mar</text>
              <text x="240" y="122" fill="#94a3b8" fontSize="9" fontWeight="500" textAnchor="middle">Apr</text>

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
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Points */}
              <circle cx="175" cy="70" r="3.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="235" cy="48" r="3.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="290" cy="24" r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
            </svg>
          </div>
        </div>

        {/* Organic Traffic Floating Card (Bottom Right) */}
        <div className="absolute bottom-[14%] right-[6%] xl:right-[12%] bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/80 w-48 z-30 animate-float-reverse">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
            ORGANIC TRAFFIC
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              190
            </span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              +30.9%
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
            vs prev day
          </span>
          <div className="mt-2 h-7 w-full">
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
          Turn growth data into actionable opportunities.
        </p>
        <p className="text-xs text-slate-400 leading-relaxed mb-4 max-w-sm mx-auto">
          Discover opportunities, generate content, optimize SEO, and measure
          growth with AI-powered workflows.
        </p>
        <div className="inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-full px-4 py-1.5 text-xs text-slate-300 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
          Workspace:{" "}
          <span className="font-semibold text-white">TripC Da Nang</span> · Active
        </div>
      </div>
    </div>
  );
}
