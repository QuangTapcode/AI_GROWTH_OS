'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { OFFICE_AGENTS_CONFIG } from '../config/agentLocations';
import { OFFICE_ROOMS } from '../config/roomRegistry';
import { CameraPreset, RoomId, ViewMode } from '../types';

interface OfficeCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent: (code: string) => void;
  onSelectRoom?: (roomId: RoomId, targetRoute?: string) => void;
  onOpenModal?: (modal: 'wallet' | 'daily_report' | 'help') => void;
  onChangeCameraPreset: (preset: CameraPreset) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onToggleAutopilot: () => void;
  isAutopilotOn: boolean;
  canAdmin?: boolean;
}

export function OfficeCommandPalette({
  isOpen,
  onClose,
  onSelectAgent,
  onSelectRoom,
  onOpenModal,
  onChangeCameraPreset,
  onChangeViewMode,
  onToggleAutopilot,
  isAutopilotOn,
  canAdmin = true,
}: OfficeCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allItems = useMemo(() => {
    const roomItems = OFFICE_ROOMS.filter((r) => !r.requiresAdmin || canAdmin).flatMap((room) => [
      {
        id: `room-${room.id}`,
        title: `${room.name} (${room.nameEn})`,
        subtitle: room.subtitle,
        category: 'Phòng Ban HQ',
        icon: room.icon,
        action: () => {
          onSelectRoom?.(room.id, room.defaultRoute);
          onClose();
        },
      },
      ...room.devices.map((dev) => ({
        id: `dev-${room.id}-${dev.id}`,
        title: `${dev.label} · ${room.name}`,
        subtitle: dev.description ?? room.subtitle,
        category: 'Chức Năng & Thiết Bị',
        icon: dev.icon,
        action: () => {
          if (dev.modalAction === 'autopilot') {
            onToggleAutopilot();
          } else if (dev.modalAction && onOpenModal) {
            onSelectRoom?.(room.id);
            onOpenModal(dev.modalAction);
          } else {
            onSelectRoom?.(room.id, dev.route);
          }
          onClose();
        },
      })),
    ]);

    const agentItems = OFFICE_AGENTS_CONFIG.map((a) => ({
      id: `agent-${a.code}`,
      title: `${a.num}: ${a.name} (${a.title})`,
      subtitle: a.department,
      category: 'Agents',
      icon: a.icon,
      action: () => {
        onSelectAgent(a.code);
        onClose();
      },
    }));

    const actionItems = [
      {
        id: 'action-autopilot',
        title: isAutopilotOn ? 'Tắt Chế Độ Autopilot Tự Hành' : 'Kích Hoạt Chế Độ Autopilot Tự Hành 24/7',
        subtitle: 'Trung tâm tự động hóa',
        category: 'Thao tác hệ thống',
        icon: '⚡',
        action: () => {
          onToggleAutopilot();
          onClose();
        },
      },
      {
        id: 'action-floorplan',
        title: 'Chuyển Sang Góc Nhìn Mặt Bằng (Top-Down)',
        subtitle: 'Quan sát toàn bộ 14 phòng ban từ trên cao',
        category: 'Camera & Chế độ',
        icon: '📐',
        action: () => {
          onChangeCameraPreset('floorplan');
          onClose();
        },
      },
      {
        id: 'action-overview',
        title: 'Chuyển Sang Góc Nhìn Phối Cảnh (Isometric)',
        subtitle: 'Toàn cảnh trụ sở 3D AI Growth OS',
        category: 'Camera & Chế độ',
        icon: '🏛️',
        action: () => {
          onChangeCameraPreset('overview');
          onClose();
        },
      },
      {
        id: 'action-toggle-2d3d',
        title: 'Chuyển Đổi Qua Lại Chế Độ 3D / 2D',
        subtitle: 'Chế độ 2D Accessibility / Fallback',
        category: 'Camera & Chế độ',
        icon: '🔄',
        action: () => {
          onChangeViewMode('2d');
          onClose();
        },
      },
    ];

    return [...roomItems, ...agentItems, ...actionItems];
  }, [
    canAdmin,
    isAutopilotOn,
    onSelectAgent,
    onSelectRoom,
    onOpenModal,
    onChangeCameraPreset,
    onChangeViewMode,
    onToggleAutopilot,
    onClose,
  ]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) selected.action();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 p-4 bg-slate-950/70 backdrop-blur-md select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/50">
          <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            autoFocus
            placeholder="Tìm Phòng ban, Agent, Review Queue, Google Maps, GPU Workers (Ctrl+K)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent border-none text-slate-100 placeholder:text-slate-500 text-sm focus:outline-hidden"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              Không tìm thấy phòng ban, Agent hoặc lệnh phù hợp với &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.action}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${isSelected
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{item.title}</p>
                      <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-2 ${isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-500'
                      }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between items-center">
          <span>Dùng phím mũi tên ↑ ↓ để duyệt, Enter để di chuyển camera &amp; mở chức năng</span>
          <span className="text-blue-400 font-mono">AI Growth OS 2026</span>
        </div>
      </div>
    </div>
  );
}
