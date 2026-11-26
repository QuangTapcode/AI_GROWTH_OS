/**
 * Shared constants and presets for Image Generation Jobs.
 */

import { ImageJobStatus } from "../gpuWorkers/models";

/**
 * Aspect Ratio Presets (Chốt ở R0 - Single Source of Truth).
 * All dimensions and aspect ratios across Cloud API, Worker, and DB constraints
 * MUST conform to this single dictionary.
 */
export const ASPECT_PRESETS = {
  "1:1": {
    width: 1080,
    height: 1080,
    description: "Square 1:1 (Facebook / Instagram post)",
  },
  "9:16": {
    width: 1080,
    height: 1920,
    description: "Vertical 9:16 (TikTok video background, Story)",
  },
  "16:9": {
    width: 1920,
    height: 1080,
    description: "Landscape 16:9 (Web Hero Banner, YouTube thumbnail)",
  },
} as const;

export type AspectRatioPreset = keyof typeof ASPECT_PRESETS;
export const ALLOWED_ASPECT_RATIOS = Object.keys(ASPECT_PRESETS) as [
  AspectRatioPreset,
  ...AspectRatioPreset[]
];

/**
 * Mandatory default negative prompt if none is supplied by caller.
 * Filters text, watermarks, distorted anatomy, and price claims.
 */
export const DEFAULT_MANDATORY_NEGATIVE_PROMPT =
  "no text, no logo, no watermark, blurry, low quality, distorted, oversaturated, deformed anatomy, bad geometry, price tag, currency, vnd, dollar";

/**
 * Customer-Facing Status Mapping.
 * Translates technical internal pipeline states into intuitive, friendly status for users.
 */
export type CustomerFacingStatus =
  | "queued"
  | "generating"
  | "reviewing"
  | "completed"
  | "failed"
  | "needs_assets"
  | "cancelled";

export function mapCustomerStatus(status: ImageJobStatus): CustomerFacingStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "claimed":
    case "running":
      return "generating";
    case "uploaded":
    case "reviewing":
      return "reviewing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "needs_assets":
      return "needs_assets";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
}

/**
 * Maps technical failure codes into customer-friendly, localized error explanations.
 */
export function mapFriendlyError(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): {
  friendlyCode: string | null;
  friendlyMessage: string | null;
} {
  if (!errorCode) {
    return { friendlyCode: null, friendlyMessage: errorMessage || null };
  }

  switch (errorCode) {
    case "GUARDRAIL_PRICE_DETECTED":
      return {
        friendlyCode: "CONTENT_SAFETY_PRICE_DETECTED",
        friendlyMessage:
          "Hình ảnh bị từ chối do xuất hiện giá tiền hoặc con số gây hiểu lầm. Hệ thống sẽ tự động thử lại với góc nhìn khác.",
      };
    case "GUARDRAIL_TEXT_DETECTED":
      return {
        friendlyCode: "CONTENT_SAFETY_TEXT_DETECTED",
        friendlyMessage:
          "Hình ảnh bị từ chối do xuất hiện văn bản hoặc ký tự.",
      };
    case "CUDA_OOM":
    case "GPU_MEMORY_FULL":
      return {
        friendlyCode: "RESOURCE_BUSY",
        friendlyMessage:
          "Máy trạm GPU đang đầy tải bộ nhớ. Tác vụ đang được xếp lại vào hàng đợi.",
      };
    case "WORKER_TIMEOUT":
      return {
        friendlyCode: "TIMEOUT_RETRY",
        friendlyMessage:
          "Quá thời gian xử lý render. Tác vụ đã được tự động xếp lại vào hàng đợi.",
      };
    case "GUARDRAIL_REJECTED":
      return {
        friendlyCode: "CONTENT_SAFETY_REJECTED",
        friendlyMessage:
          "Hình ảnh không vượt qua tiêu chuẩn kiểm định an toàn và chất lượng.",
      };
    default:
      return {
        friendlyCode: errorCode,
        friendlyMessage: errorMessage || "Đã xảy ra lỗi trong quá trình sinh ảnh.",
      };
  }
}

