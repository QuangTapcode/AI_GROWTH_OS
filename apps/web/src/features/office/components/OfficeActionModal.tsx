'use client';

import React, { useEffect } from 'react';
import { OfficeAgentViewModel } from '../types';

interface OfficeActionModalProps {
  isOpen: boolean;
  agent: OfficeAgentViewModel | null;
  actionType: 'run_task' | 'retry_task';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function OfficeActionModal({
  isOpen,
  agent,
  actionType,
  onConfirm,
  onCancel,
  isLoading,
}: OfficeActionModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) onCancel();
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen || !agent) return null;

  const isRetry = actionType === 'retry_task';
  const modalTitle = isRetry
    ? `Thử Lại Tác Vụ: ${agent.name}`
    : `Khởi Chạy AI Run: ${agent.name}`;
  const modalDesc = isRetry
    ? `Hệ thống sẽ gửi yêu cầu thử lại tác vụ '${agent.currentTask?.title ?? 'Tác vụ'}' vào hàng đợi xử lý của hệ thống worker.`
    : `Hệ thống sẽ tạo mới một tác vụ AI Run cho ${agent.title}. Tác vụ sẽ được phân phối tới hàng đợi AI Orchestrator và Worker GPU.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{agent.icon}</span>
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                Xác Nhận Thao Tác
              </span>
              <h3 className="font-bold text-white text-base leading-tight mt-0.5">
                {modalTitle}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">{modalDesc}</p>

          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Phòng ban:</span>
              <span className="font-semibold text-slate-200">{agent.department}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Trách nhiệm:</span>
              <span className="font-semibold text-slate-200 truncate max-w-[220px]">
                {agent.kpi}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-950/40 border border-blue-900/50 text-blue-300">
            <svg className="w-4 h-4 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[11px]">
              Tác vụ sẽ chạy ngầm không đồng bộ và tự động cập nhật trạng thái trên văn phòng 3D.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            {isLoading && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            <span>{isRetry ? 'Xác Nhận Thử Lại' : 'Khởi Chạy Ngay'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
