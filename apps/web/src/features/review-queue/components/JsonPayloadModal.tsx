"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface JsonPayloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  payload: Record<string, unknown>;
}

export default function JsonPayloadModal({
  isOpen,
  onClose,
  title,
  payload,
}: JsonPayloadModalProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-950 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-2 font-mono text-xs text-blue-400">
            <span>{"{ }"}</span>
            <span className="font-semibold text-slate-200 truncate">{title} · {t.common.rawPayload}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              {copied ? t.common.copied : t.common.copyJson}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Code Content */}
        <pre className="p-5 font-mono text-xs leading-relaxed text-emerald-400 bg-slate-950 max-h-[460px] overflow-auto select-text">
          {jsonString}
        </pre>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-900/50 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>{t.common.jsonSchemaFormat}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
