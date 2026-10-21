"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Language, Translations, translations } from "./translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
  formatTimeAgo: (rawTime: string) => string;
}

const STORAGE_KEY = "ai_growth_os_lang";

const LanguageContext = createContext<LanguageContextType>({
  language: "vi",
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: translations.vi,
  formatTimeAgo: (s) => s,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === "vi" || stored === "en") {
        setLanguageState(stored);
      }
    } catch {
      // Ignore localStorage errors (e.g. incognito / SSR)
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      // Ignore storage errors
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "vi" ? "en" : "vi");
  };

  const formatTimeAgo = (raw: string): string => {
    if (language === "en") return raw;
    // Map English expressions like "12m ago", "1h ago", "2 days ago" to Vietnamese
    return raw
      .replace(/(\d+)\s*m\s*ago/gi, "$1 phút trước")
      .replace(/(\d+)\s*min\s*ago/gi, "$1 phút trước")
      .replace(/(\d+)\s*h\s*ago/gi, "$1 giờ trước")
      .replace(/(\d+)\s*d\s*ago/gi, "$1 ngày trước")
      .replace(/(\d+)\s*days\s*ago/gi, "$1 ngày trước")
      .replace(/just now/gi, "vừa xong");
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t: translations[language],
        formatTimeAgo,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
