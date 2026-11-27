'use client';

import React, { useState, useMemo } from 'react';
import { OfficeEvent } from '../types';
import { OFFICE_AGENTS_CONFIG } from '../config/agentLocations';

interface OfficeActivityTimelineProps {
  events: OfficeEvent[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectAgent: (code: string) => void;
}

export function OfficeActivityTimeline({
  events,
  isOpen,
  onToggle,
  onSelectAgent,
}: OfficeActivityTimelineProps) {
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedAgentFilter !== 'all' && e.agentCode !== selectedAgentFilter) return false;
      if (selectedTypeFilter !== 'all' && e.type !== selectedTypeFilter) return false;
      if (searchQuery.trim() && !e.message.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [events, selectedAgentFilter, selectedTypeFilter, searchQuery]);

  return (
    <div className="fixed bottom-3 left-4 right-4 sm:right-auto sm:w-[480px] z-30 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 transition-all duration-300">
        {/* Header / Toggle Bar */}
        <div
          onClick={onToggle}
          className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 hover:bg-slate-950/80 transition-colors cursor-pointer border-b border-slate-800"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="font-bold text-xs text-white tracking-wide">
              Nhật Ký Tác Vụ & Sự Kiện Tự Hành
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
              {events.length} logs
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              {isOpen ? 'Thu gọn ▲' : 'Mở rộng ▼'}
            </span>
            <button
              type="button"
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded View */}
        {isOpen && (
          <div className="p-3.5 space-y-3 text-xs">
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[140px] px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 placeholder:text-slate-500 text-xs focus:outline-hidden focus:border-blue-500"
              />

              <select
                value={selectedAgentFilter}
                onChange={(e) => setSelectedAgentFilter(e.target.value)}
                className="px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
              >
                <option value="all">Tất cả Agent (8)</option>
                {OFFICE_AGENTS_CONFIG.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.num}: {a.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
              >
                <option value="all">Mọi loại sự kiện</option>
                <option value="started">Bắt đầu chạy</option>
                <option value="completed">Hoàn thành</option>
                <option value="approval_required">Cần phê duyệt</option>
                <option value="failed">Lỗi / Thất bại</option>
                <option value="autopilot">Sự kiện Autopilot</option>
              </select>
            </div>

            {/* Event list */}
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {filteredEvents.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">
                  Không tìm thấy sự kiện nào khớp với bộ lọc.
                </div>
              ) : (
                filteredEvents.map((evt) => {
                  const agent = OFFICE_AGENTS_CONFIG.find((a) => a.code === evt.agentCode);
                  let badge = 'bg-slate-800 text-slate-300';
                  if (evt.type === 'completed') badge = 'bg-emerald-950 text-emerald-300 border-emerald-800/50';
                  else if (evt.type === 'started') badge = 'bg-blue-950 text-blue-300 border-blue-800/50';
                  else if (evt.type === 'approval_required') badge = 'bg-amber-950 text-amber-300 border-amber-800/50';
                  else if (evt.type === 'failed') badge = 'bg-rose-950 text-rose-300 border-rose-800/50';

                  return (
                    <div
                      key={evt.id}
                      onClick={() => onSelectAgent(evt.agentCode)}
                      className="p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base mt-0.5">{agent?.icon ?? '🤖'}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 text-xs">
                              {agent?.name ?? evt.agentCode}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${badge}`}>
                              {evt.type}
                            </span>
                          </div>
                          <p className="text-slate-300 text-[11px] mt-0.5 leading-snug">
                            {evt.message}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                        {evt.timestamp}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
