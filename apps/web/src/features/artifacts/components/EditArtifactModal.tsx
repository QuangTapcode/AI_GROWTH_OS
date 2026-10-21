"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ArtifactDeliverable } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface EditArtifactModalProps {
  isOpen: boolean;
  onClose: () => void;
  artifact: ArtifactDeliverable | null;
  onSave: (artifactId: string, updatedTitle: string, updatedContent: string) => void;
}

export default function EditArtifactModal({
  isOpen,
  onClose,
  artifact,
  onSave,
}: EditArtifactModalProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Sync state when artifact changes or modal opens
  useEffect(() => {
    if (artifact) {
      setTitle(artifact.title);
      setContent(artifact.documentContent);
    }
  }, [artifact, isOpen]);

  // Handle ESC key to discard/close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Live word and character counts
  const wordCount = useMemo(() => {
    if (!content.trim()) return 0;
    return content.trim().split(/\s+/).filter(Boolean).length;
  }, [content]);

  const charCount = useMemo(() => {
    return content.length.toLocaleString();
  }, [content]);

  // Calculate next version string (e.g., v3 -> v4)
  const nextVersionText = useMemo(() => {
    if (!artifact) return "v4";
    const match = artifact.version.match(/v(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return `v${num + 1}`;
    }
    return `${artifact.version}-new`;
  }, [artifact]);

  if (!isOpen || !artifact) return null;

  const handleSave = () => {
    onSave(artifact.id, title, content);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-3xl overflow-hidden transform transition-all duration-200 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/70 text-blue-600 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                  {t.artifacts.editArtifact}
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {artifact.version}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium leading-tight mt-0.5">
                {artifact.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            title={`${t.common.close} (Esc)`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-6 space-y-5 text-left max-h-[75vh] overflow-y-auto">
          {/* Section 1: Artifact Title Input */}
          <div>
            <label
              htmlFor="artifact-title-input"
              className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2"
            >
              {t.artifacts.titleLabel}
            </label>
            <input
              id="artifact-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.artifacts.titleLabel}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
            />
          </div>

          {/* Section 2: Document Content (Markdown / Text) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="artifact-content-textarea"
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                {t.artifacts.documentContentLabel}
              </label>
              <span className="text-xs font-mono text-slate-400">
                {wordCount} {t.common.words} · {charCount} {t.common.characters}
              </span>
            </div>
            <textarea
              id="artifact-content-textarea"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter markdown or plain text content..."
              className="w-full bg-white border border-slate-200 rounded-xl p-4 font-mono text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs resize-y min-h-[260px]"
            />
          </div>

          {/* Section 3: Version Control Notice Box */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-700">
            <svg
              className="w-4 h-4 text-blue-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="leading-relaxed">
              <strong className="font-semibold text-slate-900">{t.artifacts.versionControlNotice}</strong>{" "}
              {t.artifacts.versionControlDesc.replace("{version}", nextVersionText)}
            </p>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>{t.common.press}</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white border border-slate-200 rounded shadow-2xs text-slate-700">
              Esc
            </kbd>
            <span>{t.common.toDiscard}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-2xs"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#1d4ed8] hover:bg-[#1e40af] active:bg-blue-900 text-white text-xs font-semibold rounded-xl cursor-pointer transition-all shadow-sm shadow-blue-600/30 flex items-center gap-1.5"
            >
              <span>{t.artifacts.saveChanges}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
