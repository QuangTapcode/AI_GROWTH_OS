'use client';

import React from 'react';

export function OfficeLoadingFallback() {
  return (
    <div className="w-full h-full min-h-[550px] bg-slate-950 flex flex-col items-center justify-center text-white p-6 select-none">
      <div className="relative flex items-center justify-center">
        {/* Outer Pulsing Ring */}
        <div className="w-20 h-20 rounded-full border-2 border-blue-500/20 border-t-cyan-400 animate-spin" />
        {/* Inner Glowing Core */}
        <div className="absolute w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
        </div>
      </div>

      <div className="mt-6 text-center space-y-2">
        <h3 className="text-base font-bold text-white tracking-tight">
          Khởi tạo Văn Phòng 3D Tự Hành
        </h3>
        <p className="text-xs text-slate-400 max-w-sm">
          Đang nạp không gian kiến trúc, thiết lập 8 vị trí Agent và đồng bộ dữ liệu thời gian thực...
        </p>
      </div>

      {/* Progress Bar simulation */}
      <div className="w-48 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 rounded-full animate-pulse w-3/4" />
      </div>
    </div>
  );
}
