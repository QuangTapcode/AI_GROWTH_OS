'use client';

import React from 'react';
import { DepartmentRoomConfig, OfficeAgentViewModel, RoomId } from '../types';
import { OFFICE_ROOMS } from '../config/roomRegistry';

interface Office2DFallbackProps {
  agents: OfficeAgentViewModel[];
  onSelectAgent: (code: string) => void;
  selectedAgentId: string | null;
  onSelectRoom?: (roomId: RoomId, targetRoute?: string) => void;
  activeRoom?: DepartmentRoomConfig | null;
  canAdmin?: boolean;
}

export function Office2DFallback({
  agents,
  onSelectAgent,
  selectedAgentId,
  onSelectRoom,
  activeRoom,
  canAdmin = true,
}: Office2DFallbackProps) {
  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 p-4 sm:p-8 pt-32 overflow-y-auto pb-24">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
                Chế độ Văn Phòng 2D (Standard Performance)
              </span>
              <span className="text-xs text-slate-500">Accessible / Low-Motion Mode</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-1.5">
              Trụ Sở AI Growth OS — 14 Phòng Ban &amp; 8 AI Agents
            </h2>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
            Mẹo: Bấm chọn bất kỳ phòng ban hoặc Agent nào để mở Console nghiệp vụ thực tế.
          </div>
        </div>

        {/* 14 Department Rooms Grid */}
        {onSelectRoom && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              14 Khu Vực &amp; Phòng Ban Nghiệp Vụ
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {OFFICE_ROOMS.filter((r) => !r.requiresAdmin || canAdmin).map((room) => {
                const isActive = activeRoom?.id === room.id;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onSelectRoom(room.id, room.defaultRoute)}
                    className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-950/60 border-blue-500 ring-2 ring-blue-500/30'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{room.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{room.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{room.subtitle}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 8-Agent Spatial Grid */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Đội Ngũ 8 AI Agent Tự Hành 24/7
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {agents.map((agent) => {
              const isSelected = selectedAgentId === agent.code;
              let statusBadge = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
              let statusLabel = 'Sẵn Sàng';
              if (agent.status === 'running') {
                statusBadge = 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse';
                statusLabel = 'Đang chạy';
              } else if (agent.status === 'needs_review') {
                statusBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
                statusLabel = 'Chờ duyệt';
              } else if (agent.status === 'error') {
                statusBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
                statusLabel = 'Lỗi';
              }

              return (
                <div
                  key={agent.code}
                  onClick={() => onSelectAgent(agent.code)}
                  className={`group cursor-pointer rounded-2xl p-4 transition-all border ${
                    isSelected
                      ? 'bg-blue-950/60 border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/40'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/5"
                      style={{ backgroundColor: `${agent.color}33` }}
                    >
                      {agent.icon}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      {agent.num} · {agent.department}
                    </span>
                    <h3 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors">
                      {agent.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {agent.desc}
                    </p>
                  </div>

                  {agent.currentTask ? (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-sky-300 truncate">
                      ⚡ {agent.currentTask.title}
                    </div>
                  ) : (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                      🎯 {agent.kpi}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
