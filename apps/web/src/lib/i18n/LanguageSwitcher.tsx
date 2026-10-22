"use client";

import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "./LanguageContext";
import type { Language } from "./translations";

export function VietnamFlag({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`${className} rounded-full overflow-hidden shrink-0 shadow-2xs`}
      aria-hidden="true"
    >
      <circle cx="256" cy="256" r="256" fill="#da251d" />
      <path
        fill="#ff0"
        d="m256 94.5 49.9 153.6h161.5l-130.6 94.9 49.9 153.6-130.7-94.9-130.7 94.9 49.9-153.6-130.6-94.9h161.5z"
      />
    </svg>
  );
}

export function UKFlag({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`${className} rounded-full overflow-hidden shrink-0 shadow-2xs`}
      aria-hidden="true"
    >
      <rect width="512" height="512" fill="#012169" />
      <path d="M0 0 L512 512 M512 0 L0 512" stroke="#ffffff" strokeWidth="68" />
      <path d="M0 0 L512 512 M512 0 L0 512" stroke="#C8102E" strokeWidth="40" />
      <path d="M256 0 V512 M0 256 H512" stroke="#ffffff" strokeWidth="102" />
      <path d="M256 0 V512 M0 256 H512" stroke="#C8102E" strokeWidth="62" />
    </svg>
  );
}

interface LanguageSwitcherProps {
  variant?: "header" | "light";
  className?: string;
}

export default function LanguageSwitcher({
  variant = "header",
  className = "",
}: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelectLanguage = (lang: Language) => {
    setLanguage(lang);
    setIsOpen(false);
  };

  const isHeader = variant === "header";

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* ── Circular Button with Flag in the Center ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={t.header.switchLanguage}
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 relative group ${
          isHeader
            ? isOpen
              ? "bg-white/25 border-2 border-white ring-2 ring-white/30 shadow-md scale-105"
              : "bg-white/10 hover:bg-white/20 border border-white/25 hover:border-white/40 shadow-xs"
            : isOpen
            ? "bg-slate-200 border-2 border-blue-500 ring-2 ring-blue-500/20 shadow-md scale-105"
            : "bg-slate-100 hover:bg-slate-200/90 border border-slate-200 hover:border-slate-300 shadow-xs"
        }`}
      >
        {/* Flag in Center */}
        {language === "vi" ? (
          <VietnamFlag className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105" />
        ) : (
          <UKFlag className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105" />
        )}

        {/* Small subtle active badge dot */}
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${
            isHeader
              ? "bg-emerald-400 border-[#1e40af]"
              : "bg-emerald-500 border-white"
          }`}
        />
      </button>

      {/* ── Dropdown Menu with Language Choices ── */}
      {isOpen && (
        <div
          role="listbox"
          aria-label={t.header.switchLanguage}
          className="absolute right-0 top-full mt-2 w-52 sm:w-56 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200/90 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"
        >
          {/* Header Label inside Dropdown */}
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {language === "vi" ? "Chọn ngôn ngữ" : "Select language"}
            </span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
              {language.toUpperCase()}
            </span>
          </div>

          {/* Option 1: Vietnamese */}
          <button
            type="button"
            role="option"
            aria-selected={language === "vi"}
            onClick={() => handleSelectLanguage("vi")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer text-left ${
              language === "vi"
                ? "bg-blue-50 text-blue-900 font-bold shadow-2xs"
                : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium"
            }`}
          >
            <div className="flex items-center gap-3">
              <VietnamFlag className="w-6 h-6" />
              <div>
                <p className="text-xs leading-tight">Tiếng Việt</p>
                <p className="text-[10px] text-slate-400 font-medium">Vietnamese</p>
              </div>
            </div>

            {language === "vi" ? (
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-xs">
                ✓
              </span>
            ) : (
              <span className="text-[10px] font-mono font-semibold text-slate-400">
                VI
              </span>
            )}
          </button>

          {/* Option 2: English */}
          <button
            type="button"
            role="option"
            aria-selected={language === "en"}
            onClick={() => handleSelectLanguage("en")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer text-left ${
              language === "en"
                ? "bg-blue-50 text-blue-900 font-bold shadow-2xs"
                : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium"
            }`}
          >
            <div className="flex items-center gap-3">
              <UKFlag className="w-6 h-6" />
              <div>
                <p className="text-xs leading-tight">English</p>
                <p className="text-[10px] text-slate-400 font-medium">Tiếng Anh</p>
              </div>
            </div>

            {language === "en" ? (
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-xs">
                ✓
              </span>
            ) : (
              <span className="text-[10px] font-mono font-semibold text-slate-400">
                EN
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
