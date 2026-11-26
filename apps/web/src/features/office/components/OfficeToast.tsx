'use client';

import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface OfficeToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function OfficeToast({ toast, onDismiss }: OfficeToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const bgStyles =
    toast.type === 'success'
      ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-300'
      : toast.type === 'error'
      ? 'bg-slate-900/95 border-rose-500/50 text-rose-300'
      : 'bg-slate-900/95 border-sky-500/50 text-sky-300';

  const icon =
    toast.type === 'success' ? (
      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    ) : toast.type === 'error' ? (
      <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ) : (
      <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );

  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full pointer-events-auto select-none animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start gap-3 ${bgStyles}`}>
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 text-xs">
          <h4 className="font-bold text-white text-sm">{toast.title}</h4>
          <p className="text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
