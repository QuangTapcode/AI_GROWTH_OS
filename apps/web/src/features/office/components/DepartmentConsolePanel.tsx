'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DepartmentRoomConfig, RoomId } from '../types';

interface DepartmentConsolePanelProps {
  room: DepartmentRoomConfig | null;
  activeRoute: string;
  isOpen: boolean;
  isMinimized: boolean;
  isExpanded: boolean;
  onSelectDevice: (roomId: RoomId, targetRoute: string) => void;
  onOpenModal: (modal: 'wallet' | 'daily_report' | 'help') => void;
  onToggleAutopilot: () => void;
  onToggleMinimized: () => void;
  onToggleExpanded: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function DepartmentConsolePanel({
  room,
  activeRoute,
  isOpen,
  isMinimized,
  isExpanded,
  onSelectDevice,
  onOpenModal,
  onToggleAutopilot,
  onToggleMinimized,
  onToggleExpanded,
  onClose,
  children,
}: DepartmentConsolePanelProps) {
  if (!isOpen || !room) return null;

  return (
    <>
      {/* Minimized Floating Re-Open Pill */}
      {isMinimized && (
        <div className="fixed bottom-16 right-4 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleMinimized}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 hover:bg-blue-700 text-white border border-blue-400/50 shadow-2xl backdrop-blur-xl text-xs font-bold transition-all cursor-pointer"
          >
            <span className="text-base">{room.icon}</span>
            <div className="text-left">
              <div className="leading-tight">{room.name}</div>
              <div className="text-[10px] text-blue-200 font-normal">Bấm để mở lại Console</div>
            </div>
          </button>
        </div>
      )}

      {/* Contextual Department Glass Panel */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.section
            key={room.id}
            aria-label={`${room.name} Console`}
            initial={{ opacity: 0.92, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`fixed top-[124px] sm:top-[132px] bottom-14 right-2 sm:right-4 z-30 flex flex-col rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden bg-white text-slate-900 transition-all duration-300 ${
              isExpanded
                ? 'left-2 sm:left-6'
                : 'left-2 sm:left-auto sm:w-[740px] lg:w-[900px] xl:w-[1040px] max-w-[calc(100vw-2rem)]'
            }`}
          >
            {/* Room Glass Console Header */}
            <div className="bg-[#102F70] text-white px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-blue-800/60 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-lg shrink-0">
                  {room.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 font-mono">
                      {room.nameEn}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/15 text-blue-100 font-mono">
                      {activeRoute}
                    </span>
                  </div>
                  <h2 className="font-bold text-sm sm:text-base text-white truncate">
                    {room.name}
                  </h2>
                </div>
              </div>

              {/* Panel Window Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-blue-100 transition-colors cursor-pointer hidden sm:flex items-center gap-1"
                  title={isExpanded ? 'Thu gọn chiều ngang để thấy rõ 3D hơn' : 'Mở rộng toàn không gian làm việc'}
                >
                  <span>{isExpanded ? '◧ Thu Gọn' : '⛶ Mở Rộng'}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleMinimized}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-blue-100 transition-colors cursor-pointer"
                  title="Tạm ẩn bảng để quan sát phòng 3D"
                >
                  <span>👁️ Xem Phòng 3D</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-colors cursor-pointer"
                  title="Đóng bảng và quay lại Toàn Cảnh HQ (Esc)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Room Interactive Devices / Terminals Sub-navigation */}
            {room.devices.length > 0 && (
              <div className="px-4 sm:px-5 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
                  Thiết bị phòng:
                </span>
                {room.devices.map((dev) => {
                  const cleanActive = activeRoute.replace(/\/+$/, '');
                  const cleanDev = dev.route.split('#')[0].split('?')[0].replace(/\/+$/, '');
                  const isCurrentDevice = !dev.modalAction && cleanActive === cleanDev;

                  return (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => {
                        if (dev.modalAction === 'autopilot') {
                          onToggleAutopilot();
                        } else if (dev.modalAction) {
                          onOpenModal(dev.modalAction);
                        } else {
                          onSelectDevice(room.id, dev.route);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                        isCurrentDevice
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                      }`}
                      title={dev.description}
                    >
                      <span>{dev.icon}</span>
                      <span>{dev.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Real Business Feature Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC]/95">
              {children}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
