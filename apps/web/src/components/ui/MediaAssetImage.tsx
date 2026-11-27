"use client";

import React, { useState } from "react";

export interface MediaAssetData {
  id?: string;
  url?: string | null;
  source_type?: "real_asset" | "ai_generated" | string;
  is_ai_generated?: boolean;
  alt_text?: string | null;
  prompt?: string | null;
  model_name?: string | null;
  seed?: number | null;
  cost_usd?: number | null;
  width?: number | null;
  height?: number | null;
  storage_key?: string | null;
  content_hash?: string | null;
  [key: string]: unknown;
}

export interface MediaAssetImageProps {
  /** The media_assets record or asset object */
  asset?: MediaAssetData | null;
  /** Direct URL fallback if asset is omitted or asset.url is empty */
  src?: string | null;
  /** Direct alt text fallback if asset.alt_text is empty */
  alt?: string;
  /** Aspect ratio container style (e.g. '1:1', '9:16', '16:9', 'auto') */
  aspectRatio?: "1:1" | "9:16" | "16:9" | "auto" | string;
  /** Custom class name for the <img> element */
  className?: string;
  /** Custom class name for the outer container */
  containerClassName?: string;
  /** Whether to show a detailed bottom caption card */
  showCaption?: boolean;
  /** Optional click handler (e.g. for lightbox preview) */
  onClick?: () => void;
}

/**
 * MediaAssetImage Component:
 * - Displays images from `media_assets` (both real enterprise photos and AI-generated visuals).
 * - Displays prominent badge "[Ảnh tạo bởi AI]" ONLY for AI-generated images.
 * - Handles loading state with a smooth animated skeleton.
 * - Handles error/broken image fallback state with informative retry action.
 * - Enforces accessible alt text standards.
 */
export default function MediaAssetImage({
  asset,
  src,
  alt,
  aspectRatio = "auto",
  className = "",
  containerClassName = "",
  showCaption = false,
  onClick,
}: MediaAssetImageProps) {
  // Determine if this is an AI-generated asset
  const isAi = Boolean(
    asset?.is_ai_generated === true ||
    asset?.source_type === "ai_generated" ||
    (asset?.ai_metadata && typeof asset.ai_metadata === "object")
  );

  // Resolved URL & Alt
  const rawUrl = asset?.url || src || "";
  const resolvedUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";

  const defaultAlt = isAi ? "Ảnh minh họa tạo bởi AI" : "Ảnh tài nguyên doanh nghiệp";
  const resolvedAlt = asset?.alt_text?.trim() || alt?.trim() || defaultAlt;

  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(resolvedUrl));
  const [hasError, setHasError] = useState<boolean>(!resolvedUrl);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    setHasError(false);
  };

  // Aspect ratio class helper
  const aspectClass =
    aspectRatio === "1:1"
      ? "aspect-square"
      : aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : aspectRatio === "16:9"
      ? "aspect-video"
      : "";

  return (
    <figure
      className={`relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 transition-all ${containerClassName}`}
      data-testid="media-asset-container"
      onClick={onClick}
    >
      {/* 1. BADGE: [Ảnh tạo bởi AI] - CHỈ HIỂN THỊ VỚI ẢNH AI */}
      {isAi && (
        <div
          className="absolute top-2.5 right-2.5 z-20 pointer-events-none"
          data-testid="ai-image-badge-wrapper"
        >
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide bg-purple-900/90 text-purple-100 border border-purple-400/40 backdrop-blur-md shadow-sm"
            data-testid="ai-image-badge"
            aria-label="Hình ảnh được tạo bởi trí tuệ nhân tạo (AI)"
          >
            <span aria-hidden="true" className="text-amber-300 text-[11px]">✨</span>
            <span>[Ảnh tạo bởi AI]</span>
          </span>
        </div>
      )}

      {/* Container with aspect ratio */}
      <div className={`relative w-full overflow-hidden flex items-center justify-center ${aspectClass}`}>
        {/* 2. LOADING SKELETON */}
        {isLoading && !hasError && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100 animate-pulse text-slate-400"
            data-testid="media-asset-loading"
          >
            <svg
              className="w-8 h-8 animate-spin text-purple-500 mb-2 opacity-80"
              xmlns="http://www.w3.org/2000/svg"
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
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span className="text-xs font-medium text-slate-500">Đang tải ảnh...</span>
          </div>
        )}

        {/* 3. ERROR FALLBACK STATE */}
        {hasError ? (
          <div
            className="w-full min-h-[180px] p-6 flex flex-col items-center justify-center bg-slate-100/90 text-center text-slate-500"
            data-testid="media-asset-error"
          >
            <svg
              className="w-10 h-10 text-slate-400 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs font-semibold text-slate-700 mb-1">
              Không thể tải hình ảnh
            </span>
            <span className="text-[11px] text-slate-500 max-w-xs line-clamp-2 px-2 italic">
              {resolvedAlt}
            </span>
            {resolvedUrl && (
              <button
                type="button"
                onClick={handleRetry}
                className="mt-3 px-2.5 py-1 text-[11px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
                data-testid="media-asset-retry-btn"
              >
                Thử lại
              </button>
            )}
          </div>
        ) : (
          /* 4. ACTUAL IMAGE ELEMENT */
          <img
            src={resolvedUrl}
            alt={resolvedAlt}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoading ? "opacity-0" : "opacity-100"
            } ${className}`}
            data-testid="media-asset-image"
          />
        )}
      </div>

      {/* 5. CAPTION & METADATA (Optional) */}
      {showCaption && (
        <figcaption
          className="p-3 bg-white border-t border-slate-100 text-xs text-slate-600 space-y-1"
          data-testid="media-asset-caption"
        >
          <div className="font-medium text-slate-800 line-clamp-1">{resolvedAlt}</div>
          {isAi && asset?.model_name && (
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>Mô hình: <strong className="font-mono text-slate-700">{asset.model_name}</strong></span>
              {asset.seed !== undefined && asset.seed !== null && (
                <span>Seed: <code className="text-slate-600">{asset.seed}</code></span>
              )}
            </div>
          )}
        </figcaption>
      )}
    </figure>
  );
}

