"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/lib/i18n/LanguageSwitcher";

export function LoginForm() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Validate strict Gmail address format (must end with @gmail.com)
  const isGmailFormat = (val: string) => {
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(val.trim());
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t.auth.emailRequired);
      return;
    }

    if (!isGmailFormat(email)) {
      setError(t.auth.emailInvalidGmail);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 350);
  };

  const handleGoogleSignIn = () => {
    setError(null);
    setIsLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 350);
  };

  return (
    <div className="w-full lg:w-[480px] xl:w-[520px] shrink-0 bg-white min-h-screen flex flex-col justify-between px-8 sm:px-12 lg:px-14 py-8 sm:py-10 border-r border-slate-200/80 shadow-xl shadow-slate-900/5 z-10">
      {/* 1. Top Logo & Language Switcher */}
      <header className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900 block leading-tight">
              AI Growth OS
            </span>
            <span className="text-[11px] font-semibold text-blue-600 tracking-wider uppercase">
              {language === "vi" ? "Hệ điều hành tăng trưởng" : "Growth Operations"}
            </span>
          </div>
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher variant="light" />
      </header>

      {/* 2. Main Center Form Area */}
      <main className="my-auto py-8 max-w-[400px] w-full mx-auto">
        {/* Badge "Đăng nhập an toàn" */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 mb-3.5">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <span>{language === "vi" ? "Đăng nhập an toàn" : "Secure Sign-in"}</span>
        </div>

        {/* H1 Heading */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
          {t.auth.welcomeBack1} {t.auth.welcomeBack2}
        </h1>

        {/* Mô tả */}
        <p className="text-sm text-slate-500 mt-2 mb-6 leading-relaxed">
          {language === "vi"
            ? "Biến dữ liệu tăng trưởng thành hành động thực tế với AI Agents thông minh."
            : "Turn growth telemetry into automated action with multi-agent intelligence."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              {t.auth.emailLabel}
            </label>
            <div className="relative flex items-center">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                />
              </svg>
              <input
                id="login-email"
                type="email"
                className={`w-full h-12 px-4 pl-10 rounded-xl border text-sm font-medium transition-all focus:outline-hidden ${
                  error
                    ? "border-rose-400 focus:ring-3 focus:ring-rose-500/15 focus:border-rose-500 bg-rose-50/20"
                    : "border-slate-300 hover:border-slate-400 focus:ring-3 focus:ring-blue-500/15 focus:border-blue-600 bg-white"
                } text-slate-900 placeholder:text-slate-400 shadow-xs`}
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1.5 font-medium">
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Nút Đăng nhập (cao 48px, full width) */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none active:translate-y-px"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t.auth.signingIn}
              </>
            ) : (
              <>
                <span>{t.auth.signIn}</span>
                <svg className="w-4 h-4 ml-0.5" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10m0 0L9 4m4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Divider "HOẶC" có 2 đường kẻ ngang */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              {language === "vi" ? "HOẶC" : "OR"}
            </span>
          </div>
        </div>

        {/* Nút Đăng nhập với Google (cao 48px) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full h-12 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 flex items-center justify-center gap-3 transition-all cursor-pointer text-sm select-none active:translate-y-px"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{t.auth.signInGoogle}</span>
        </button>
      </main>

      {/* 3. Footer (cố định đáy panel, có padding, không đè nội dung) */}
      <footer className="w-full pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <span>{t.auth.copyright}</span>
        <div className="flex items-center gap-3 font-medium">
          <Link href="/terms" className="hover:text-blue-600 transition-colors">
            {t.auth.termsOfService}
          </Link>
          <span className="text-slate-300">&middot;</span>
          <Link href="/privacy" className="hover:text-blue-600 transition-colors">
            {t.auth.privacyPolicy}
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default LoginForm;
