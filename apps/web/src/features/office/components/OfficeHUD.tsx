'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  CameraPreset,
  CeilingMode,
  DepartmentRoomConfig,
  OfficeAgentViewModel,
  QualityPreset,
  RoomId,
  TimeOfDayPreset,
  ViewMode,
} from '../types';
import { OFFICE_ROOMS } from '../config/roomRegistry';
import { initials } from '../../../lib/format';
import { useLanguage } from '../../../lib/i18n/LanguageContext';

export interface HudWorkspaceOption {
  id: string;
  name: string;
  slug: string;
  roleLabel: string;
}

interface OfficeHUDProps {
  agents: OfficeAgentViewModel[];
  selectedAgentId: string | null;
  onSelectAgent: (code: string) => void;
  activeRoom?: DepartmentRoomConfig | null;
  onSelectRoom?: (roomId: RoomId, targetRoute?: string) => void;
  onReturnOverview?: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  cameraPreset: CameraPreset;
  onChangeCameraPreset: (preset: CameraPreset) => void;
  qualityPreset?: QualityPreset;
  onChangeQualityPreset?: (preset: QualityPreset) => void;
  onOpenCommandPalette?: () => void;
  onToggleFloorPlan?: () => void;
  isFloorPlanOpen?: boolean;
  onToggleTimeline?: () => void;
  isTimelineOpen?: boolean;
  onToggleAutopilot?: () => void;
  isAutopilotOn?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  // Global Shell Props (migrated from removed sidebar/header)
  workspaces?: HudWorkspaceOption[];
  currentWorkspace?: HudWorkspaceOption | null;
  onSelectWorkspace?: (workspaceId: string) => void;
  user?: { name: string; role: string } | null;
  onLogout?: () => void;
  notificationsCount?: number;
  apiConnection?: 'checking' | 'connected' | 'unavailable';
  onOpenWallet?: () => void;
  onOpenDailyReport?: () => void;
  onOpenHelp?: () => void;
  canAdmin?: boolean;
  timeOfDay?: TimeOfDayPreset;
  onChangeTimeOfDay?: (t: TimeOfDayPreset) => void;
  ceilingMode?: CeilingMode;
  onToggleCeilingMode?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  fps?: number | null;
}

export function OfficeHUD({
  agents,
  selectedAgentId,
  onSelectAgent,
  activeRoom = null,
  onSelectRoom,
  onReturnOverview,
  viewMode,
  onChangeViewMode,
  cameraPreset,
  onChangeCameraPreset,
  qualityPreset = 'balanced',
  onChangeQualityPreset = () => {},
  onOpenCommandPalette = () => {},
  onToggleFloorPlan,
  isFloorPlanOpen = false,
  onToggleTimeline,
  isTimelineOpen = false,
  onToggleAutopilot,
  isAutopilotOn = false,
  onRefresh,
  isRefreshing = false,
  workspaces = [],
  currentWorkspace = null,
  onSelectWorkspace,
  user = null,
  onLogout,
  notificationsCount = 0,
  apiConnection = 'connected',
  onOpenWallet,
  onOpenDailyReport,
  onOpenHelp,
  canAdmin = true,
  timeOfDay = 'daytime',
  onChangeTimeOfDay,
  ceilingMode = 'cutaway',
  onToggleCeilingMode,
  soundEnabled = false,
  onToggleSound,
  fps = null,
}: OfficeHUDProps) {
  const { language, toggleLanguage } = useLanguage();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [stripMode, setStripMode] = useState<'agents' | 'rooms'>('agents');
  const wsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setShowWsMenu(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleToggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const onlineCount = agents.filter((a) => a.isOnline).length;
  const runningCount = agents.filter((a) => a.status === 'running').length;
  const reviewCount = agents.filter((a) => a.status === 'needs_review').length;

  return (
    <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none p-2.5 sm:p-3.5 flex flex-col gap-2">
      {/* ── Floating Top Bar (No Left Sidebar) ── */}
      <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 rounded-2xl bg-slate-900/88 backdrop-blur-xl border border-slate-700/70 shadow-2xl text-white">
        {/* Left: Identity + Workspace Switcher + Spatial Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onReturnOverview}
            className="flex items-center gap-2 cursor-pointer group"
            title="Quay về Toàn Cảnh Trụ Sở 3D"
          >
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="font-black text-xs sm:text-sm tracking-wide text-slate-100 flex items-center gap-1.5">
              <span>AI GROWTH OS</span>
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-blue-600/35 text-blue-300 border border-blue-500/40 font-mono">
                3D OFFICE 2026
              </span>
            </span>
          </button>

          {/* Workspace Switcher Pill */}
          {currentWorkspace && workspaces.length > 0 && (
            <div className="relative" ref={wsRef}>
              <button
                type="button"
                onClick={() => setShowWsMenu((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer transition-colors"
              >
                <span className="w-4 h-4 rounded bg-blue-600 text-[10px] font-bold flex items-center justify-center">
                  {initials(currentWorkspace.name)}
                </span>
                <span className="max-w-[110px] truncate">{currentWorkspace.name}</span>
                <span className="text-slate-400 text-[10px]">▾</span>
              </button>

              {showWsMenu && (
                <div className="absolute left-0 top-10 w-60 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl z-50 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                    Workspaces ({workspaces.length})
                  </div>
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => {
                        onSelectWorkspace?.(ws.id);
                        setShowWsMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer ${
                        ws.id === currentWorkspace.id
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      <span className="text-[10px] opacity-75">{ws.roleLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compact Location Breadcrumb */}
          {activeRoom && (
            <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={onReturnOverview}
                className="text-slate-400 hover:text-white cursor-pointer transition-colors"
              >
                HQ
              </button>
              <span className="text-slate-600">/</span>
              <span className="flex items-center gap-1 font-semibold text-cyan-300">
                <span>{activeRoom.icon}</span>
                <span>{activeRoom.name}</span>
              </span>
            </div>
          )}

          {/* Autopilot Live Badge */}
          {onToggleAutopilot && (
            <button
              type="button"
              onClick={onToggleAutopilot}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isAutopilotOn
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 shadow-xs shadow-emerald-500/20'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Bật/Tắt chế độ tự động điều hành Autopilot 24/7"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isAutopilotOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="font-mono text-[11px]">
                {isAutopilotOn ? 'AUTOPILOT ON' : 'AUTOPILOT OFF'}
              </span>
            </button>
          )}

          {/* Realtime Metrics Counters */}
          <div className="hidden 2xl:flex items-center gap-2 pl-2 border-l border-slate-700/80 text-xs text-slate-400">
            <span className="text-slate-300">
              <strong className="text-emerald-400">{onlineCount}/8</strong> Online
            </span>
            {runningCount > 0 && (
              <span className="text-sky-300">
                • <strong className="text-sky-400">{runningCount}</strong> Chạy
              </span>
            )}
            {reviewCount > 0 && (
              <span className="text-amber-300">
                • <strong className="text-amber-400">{reviewCount}</strong> Cần duyệt
              </span>
            )}
          </div>
        </div>

        {/* Right: Search, API Status, Quick Modals, Camera/Quality/View, Profile */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Global Search / Command Palette */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs transition-colors cursor-pointer"
            title="Tìm Phòng ban, Agent hoặc Chức năng (Ctrl+K)"
          >
            <span>🔍</span>
            <span className="hidden md:inline text-[11px]">Tìm lệnh</span>
            <kbd className="hidden sm:inline px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-[10px] text-blue-400 font-mono">
              Ctrl+K
            </kbd>
          </button>

          {/* API Connection Pill */}
          <button
            type="button"
            onClick={() => onSelectRoom?.('command_center', '/health')}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/70 border border-slate-700/80 text-[11px] font-medium cursor-pointer hover:bg-slate-800"
            title="Trạng thái kết nối API Backend"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnection === 'connected'
                  ? 'bg-emerald-400'
                  : apiConnection === 'unavailable'
                  ? 'bg-rose-500'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-slate-300">
              {apiConnection === 'connected'
                ? 'API OK'
                : apiConnection === 'unavailable'
                ? 'API Offline'
                : 'Checking'}
            </span>
          </button>

          {/* Floor Plan & Timeline Quick Toggles */}
          {onToggleFloorPlan && (
            <button
              type="button"
              onClick={onToggleFloorPlan}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs transition-colors border cursor-pointer ${
                isFloorPlanOpen
                  ? 'bg-blue-600/35 text-blue-200 border-blue-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Bật/Tắt sơ đồ mặt bằng [P]"
            >
              <span>📐</span>
              <span className="hidden xl:inline text-[11px]">Mặt bằng</span>
            </button>
          )}
          {onToggleTimeline && (
            <button
              type="button"
              onClick={onToggleTimeline}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs transition-colors border cursor-pointer ${
                isTimelineOpen
                  ? 'bg-blue-600/35 text-blue-200 border-blue-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Bật/Tắt nhật ký sự kiện [T]"
            >
              <span>⏱️</span>
              <span className="hidden xl:inline text-[11px]">Nhật ký</span>
            </button>
          )}

          {/* Quality Presets */}
          {viewMode === '3d' && (
            <div className="hidden lg:flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700 text-xs">
              {(['high', 'balanced', 'performance'] as QualityPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeQualityPreset(preset)}
                  className={`px-2 py-1 rounded-lg font-medium transition-all text-[11px] cursor-pointer ${
                    qualityPreset === preset
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Chất lượng đồ họa: ${preset.toUpperCase()}`}
                >
                  {preset === 'high' ? 'Cao' : preset === 'balanced' ? 'Cân Bằng' : 'Tiết Kiệm'}
                </button>
              ))}
            </div>
          )}

          {/* Camera Presets */}
          {viewMode === '3d' && (
            <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => onChangeCameraPreset('overview')}
                className={`px-2 py-1 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  cameraPreset === 'overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Góc nhìn phối cảnh toàn thể [Phím F]"
              >
                Phối Cảnh
              </button>
              <button
                type="button"
                onClick={() => onChangeCameraPreset('floorplan')}
                className={`px-2 py-1 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  cameraPreset === 'floorplan'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Góc nhìn mặt bằng từ trên xuống [Phím F]"
              >
                Mặt Bằng
              </button>
              <button
                type="button"
                onClick={() => onChangeCameraPreset('entrance')}
                className={`hidden xl:inline-flex px-2 py-1 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  cameraPreset === 'entrance'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Quan sát mặt tiền, cửa kính trượt và sảnh đón tiếp"
              >
                Cổng Chính
              </button>
              <button
                type="button"
                onClick={() => onChangeCameraPreset('walkthrough')}
                className={`hidden xl:inline-flex px-2 py-1 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  cameraPreset === 'walkthrough'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Chế độ dạo bước nội thất (Dùng phím WASD / Mũi tên)"
              >
                Dạo Bước
              </button>
            </div>
          )}

          {/* Time-of-Day Lighting & Ceiling Cutaway Toggle */}
          {viewMode === '3d' && onChangeTimeOfDay && (
            <div className="hidden 2xl:flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700 text-[11px]">
              {(
                [
                  { id: 'morning', label: 'Sáng' },
                  { id: 'daytime', label: 'Ngày' },
                  { id: 'evening', label: 'Chiều' },
                  { id: 'night', label: 'Tối' },
                ] as const
              ).map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onChangeTimeOfDay(slot.id)}
                  className={`px-1.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    timeOfDay === slot.id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Ánh sáng thời điểm: ${slot.label}`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}

          {viewMode === '3d' && onToggleCeilingMode && (
            <button
              type="button"
              onClick={onToggleCeilingMode}
              className={`hidden xl:flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] font-medium cursor-pointer transition-colors ${
                ceilingMode === 'interior'
                  ? 'bg-indigo-600/40 border-indigo-400/50 text-indigo-100'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Chuyển chế độ Trần mở (Cutaway) / Trần nội thất (Interior)"
            >
              <span>{ceilingMode === 'interior' ? '🏢 Trần Kín' : '✂️ Mở Mái'}</span>
            </button>
          )}

          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              className={`hidden xl:flex p-1.5 rounded-xl border text-xs cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-700/60 border-emerald-500/50 text-white'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={soundEnabled ? 'Tắt âm thanh văn phòng' : 'Bật âm thanh tương tác nhẹ'}
            >
              <span>{soundEnabled ? '🔊' : '🔇'}</span>
            </button>
          )}

          {viewMode === '3d' && typeof fps === 'number' && (
            <span
              className="hidden 2xl:inline-flex items-center px-2 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-[10px] font-mono text-emerald-300"
              title="Tốc độ khung hình WebGL thực tế"
            >
              {fps} FPS
            </span>
          )}

          {/* 3D vs 2D Switcher */}
          <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => onChangeViewMode('3d')}
              className={`px-2 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3D
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('2d')}
              className={`px-2 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2D
            </button>
          </div>

          {/* Daily Report + Wallet + Notifications */}
          {onOpenDailyReport && (
            <button
              type="button"
              onClick={onOpenDailyReport}
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer"
              title="Báo Cáo Điều Hành Ngày"
            >
              <span>📊</span>
            </button>
          )}
          {onOpenWallet && (
            <button
              type="button"
              onClick={onOpenWallet}
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/40 text-xs text-white font-semibold cursor-pointer"
              title="Nạp Tín Dụng Marketing qua VietQR"
            >
              <span>💳</span>
            </button>
          )}

          {/* Attention / Review Notifications Bell */}
          <button
            type="button"
            onClick={() => onSelectRoom?.('review_room', '/review-queue')}
            className="relative p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            title={`${notificationsCount} mục cần duyệt hoặc xử lý`}
          >
            <span>🔔</span>
            {notificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {notificationsCount > 9 ? '9+' : notificationsCount}
              </span>
            )}
          </button>

          {/* Language Toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="px-2 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[10px] font-mono uppercase text-slate-300 cursor-pointer"
            title="Chuyển ngôn ngữ VI / EN"
          >
            {language}
          </button>

          {/* Fullscreen & Shortcuts */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="hidden xl:flex p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs cursor-pointer"
            title="Toàn màn hình (Fullscreen)"
          >
            ⛶
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShortcuts((prev) => !prev)}
              className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              title="Xem danh sách phím tắt điều hướng nhanh"
            >
              <span>⌨️</span>
              <span className="hidden xl:inline text-[11px] font-mono">Phím tắt</span>
            </button>

            {showShortcuts && (
              <div className="absolute top-10 right-0 w-64 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs space-y-2 z-50">
                <div className="font-bold text-white border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span>Phím Tắt Điều Hướng</span>
                  <span className="text-[10px] text-blue-400 font-mono">2026 Pro</span>
                </div>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  <div className="flex justify-between">
                    <span>Chọn Agent 1 - 8:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">1 - 8</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Command Palette:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">Ctrl + K</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Mặt bằng / Phối cảnh:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">F</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Mini-Map Floor Plan:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">P</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Nhật ký sự kiện:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">T</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Chuyển 3D / 2D:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">V</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Đóng &amp; Về HQ:</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">Esc / 0</kbd>
                  </div>
                </div>
                {onOpenHelp && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowShortcuts(false);
                      onOpenHelp();
                    }}
                    className="w-full py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 font-semibold text-center cursor-pointer"
                  >
                    Mở Tài Liệu Hướng Dẫn →
                  </button>
                )}
              </div>
            )}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Làm mới trạng thái"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

          {/* User Profile & Account Menu */}
          {user && (
            <div className="relative" ref={userRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu((p) => !p)}
                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 cursor-pointer"
                title={user.name}
              >
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {initials(user.name)}
                </span>
                <span className="hidden md:inline text-xs font-semibold max-w-[90px] truncate">{user.name}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-10 w-52 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl z-50 text-xs space-y-1">
                  <div className="px-2.5 py-1.5 border-b border-slate-800">
                    <p className="font-bold text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-slate-400">{user.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onSelectRoom?.('reception_lobby', '/workspace#profile');
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    ⚙️ Hồ Sơ &amp; Cài Đặt
                  </button>
                  {onOpenHelp && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenHelp();
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-slate-200 hover:bg-slate-800 cursor-pointer"
                    >
                      ❓ Trợ Giúp &amp; Tài Liệu
                    </button>
                  )}
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-rose-400 hover:bg-rose-950/50 cursor-pointer font-semibold"
                    >
                      ↪ Đăng Xuất
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Floating Horizontal Switcher Strip: 8 AI Agents / 14 Department Rooms ── */}
      <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none snap-x">
        {onSelectRoom && (
          <div className="flex items-center bg-slate-900/85 border border-slate-700/70 rounded-xl p-0.5 shrink-0 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setStripMode('agents')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                stripMode === 'agents' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              8 Agents
            </button>
            <button
              type="button"
              onClick={() => setStripMode('rooms')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                stripMode === 'rooms' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              14 Phòng Ban
            </button>
          </div>
        )}

        {stripMode === 'agents'
          ? agents.map((agent, idx) => {
              const isSelected = selectedAgentId === agent.code;
              let statusDotColor = 'bg-slate-400';
              if (agent.status === 'running') statusDotColor = 'bg-sky-400 animate-pulse';
              else if (agent.status === 'completed' || agent.isOnline) statusDotColor = 'bg-emerald-400';
              else if (agent.status === 'needs_review') statusDotColor = 'bg-amber-400 animate-ping';
              else if (agent.status === 'error') statusDotColor = 'bg-rose-500';

              return (
                <button
                  key={agent.code}
                  type="button"
                  onClick={() => onSelectAgent(agent.code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border snap-start shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/95 text-white border-blue-400 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/40'
                      : 'bg-slate-900/80 hover:bg-slate-800/95 text-slate-200 border-slate-700/60 backdrop-blur-md'
                  }`}
                >
                  <span className="text-sm">{agent.icon}</span>
                  <span className="hidden sm:inline font-mono opacity-80">{idx + 1}:</span>
                  <span>{agent.name}</span>
                  <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
                </button>
              );
            })
          : OFFICE_ROOMS.filter((r) => !r.requiresAdmin || canAdmin).map((room) => {
              const isActive = activeRoom?.id === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom?.(room.id, room.defaultRoute)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border snap-start shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600/95 text-white border-blue-400 shadow-lg ring-2 ring-blue-500/40'
                      : 'bg-slate-900/80 hover:bg-slate-800/95 text-slate-200 border-slate-700/60 backdrop-blur-md'
                  }`}
                >
                  <span>{room.icon}</span>
                  <span>{room.name}</span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
