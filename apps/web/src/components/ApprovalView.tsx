"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import MediaAssetImage, { MediaAssetData } from "./ui/MediaAssetImage";
import { getSession } from "../lib/session";

/**
 * Danh sách 8 nhóm lỗi chuẩn hóa (từ CM-19 Annotation Guide) để chọn khi từ chối duyệt
 */
export const REJECTION_ERROR_CATEGORIES = [
  { id: "hallucinated_price_or_num", label: "Bịa số / giá tiền (Hallucinated Price or Number)" },
  { id: "unsupported_inference", label: "Suy diễn ngoài facts (Unsupported Inference)" },
  { id: "hyperbolic_claims", label: "Thêm tính từ mức độ / từ tuyệt đối (Hyperbolic / Superlative Claims)" },
  { id: "voice_mismatch", label: "Lệch Brand Voice (Voice or Tone Mismatch)" },
  { id: "format_length_violation", label: "Sai độ dài / format kênh (Length / Channel Format Violation)" },
  { id: "invalid_cta", label: "CTA sai / vi phạm Zero-Claim (Invalid CTA Claim)" },
  { id: "image_policy_violation", label: "Vi phạm chính sách ảnh AI (AI Image Policy Violation)" },
  { id: "hashtag_claim_violation", label: "Hashtag phá luật Zero-Claim (Hashtag Claim Violation)" },
  { id: "other", label: "Lý do khác (Nhập ghi chú chi tiết)" },
] as const;

export interface SentenceMapping {
  sentence_id: string;
  sentence_text: string;
  sentence_type: "factual" | "hook" | "cta";
  fact_id?: string;
  source_quote?: string;
  source_url?: string;
  entailment_status?: "ENTAILED" | "ZERO_CLAIM_VERIFIED" | "NEUTRAL" | "CONTRADICTION";
  confidence?: number;
}

export interface AiImageMeta {
  url: string;
  prompt: string;
  negative_prompt: string;
  model: string;
  aspect_ratio: "1:1" | "9:16";
  dimensions: string;
  ocr_checked: boolean;
  ocr_text_found: string[];
  safety_passed: boolean;
  sha256_hash: string;
}

export interface ChannelPackData {
  channel: "facebook" | "tiktok";
  title: string;
  hook: string;
  body: string[];
  cta: string;
  hashtags: string[];
  full_caption: string;
  sentences: SentenceMapping[];
  ai_image?: AiImageMeta;
  tiktok_storyboard?: Array<{
    scene_number: number;
    duration_seconds: number;
    visual_cue: string;
    voiceover: string;
    on_screen_text: string;
  }>;
}

export interface VersionRecord {
  version: number;
  author_type: "ai" | "human";
  author_name: string;
  content_hash: string;
  caption_text: string;
  diff_from_previous?: {
    added_words: string[];
    removed_words: string[];
    summary: string;
  };
  created_at: string;
}

export type ImageJobDisplayStatus =
  | "image_pending"
  | "queued"
  | "claimed"
  | "running"
  | "uploaded"
  | "reviewing"
  | "completed"
  | "needs_assets"
  | "failed"
  | "cancelled";

export interface ImageJobUiState {
  status: ImageJobDisplayStatus;
  job_id: string | null;
  gpu_online: boolean;
  image_url: string | null;
  content_hash: string | null;
  media_asset_id: string | null;
  error_code: string | null;
  error_message: string | null;
  message: string | null;
  prompt: string;
  model_name: string;
  seed: number | null;
  dimensions: string;
  aspect_ratio: "1:1" | "9:16";
  ocr_checked: boolean;
  safety_passed: boolean;
}

export interface ApprovalViewProps {
  workspaceId?: string;
  workspaceName?: string;
  userRole?: "owner" | "editor" | "viewer";
  postId?: string;
  initialVersion?: number;
  initialParentSeoVersion?: number;
  requiresImage?: boolean;
  initialImageJobId?: string | null;
  initialImageStatus?: ImageJobDisplayStatus;
  initialGpuOnline?: boolean;
  initialData?: {
    facebook: ChannelPackData;
    tiktok: ChannelPackData;
  };
  onApproveSuccess?: (approvalPayload: {
    target_version: number;
    target_hash: string;
    approved_by_role: string;
    image_asset_id?: string | null;
    image_content_hash?: string | null;
  }) => void;
  onRejectSuccess?: (rejectionPayload: {
    reason_category: string;
    review_note: string;
  }) => void;
  onEditSaveSuccess?: (newVersion: VersionRecord) => void;
  onPublishClick?: () => void;
  // Overridable API client methods for testing or custom host configuration
  fetchImageJob?: (jobId: string) => Promise<{
    job_id?: string;
    status?: string;
    customer_status?: string;
    message?: string;
    image_url?: string | null;
    content_hash?: string | null;
    media_asset_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    gpu_online?: boolean;
    seed?: number;
  }>;
  createImageJobFn?: (params: {
    workspace_id: string;
    post_id?: string;
    prompt: string;
    negative_prompt?: string;
    aspect_ratio: "1:1" | "9:16";
    seed?: number;
  }) => Promise<{
    job_id?: string;
    id?: string;
    status: string;
    gpu_online?: boolean;
    seed?: number;
  }>;
  cancelImageJobFn?: (jobId: string) => Promise<{
    job_id?: string;
    status: string;
  }>;
}

/**
 * Tính SHA-256 giả lập xác định trên client (hoặc băm chuẩn nếu có Crypto API)
 */
async function computeSha256Client(text: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, "0");
}

function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && (window as any).__AGOS_API_URL) {
    return (window as any).__AGOS_API_URL;
  }
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
  return envUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const session = getSession();
  const token = session?.token || process.env.NEXT_PUBLIC_DEV_TOKEN || "dev_internal_secret_token_123";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function defaultCreateImageJob(params: {
  workspace_id: string;
  post_id?: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: "1:1" | "9:16";
  seed?: number;
}) {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/image-jobs`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

async function defaultFetchImageJob(jobId: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/image-jobs/${encodeURIComponent(jobId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

async function defaultCancelImageJob(jobId: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/image-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

export default function ApprovalView({
  workspaceName = "TripC Da Nang",
  userRole = "editor",
  initialVersion = 1,
  initialParentSeoVersion = 1,
  requiresImage = true,
  initialImageJobId = null,
  initialImageStatus,
  initialGpuOnline = true,
  initialData,
  onApproveSuccess,
  onRejectSuccess,
  onEditSaveSuccess,
  onPublishClick,
  fetchImageJob,
  createImageJobFn,
  cancelImageJobFn,
}: ApprovalViewProps) {
  // 1. Channel Selector: Facebook | TikTok
  const [selectedChannel, setSelectedChannel] = useState<"facebook" | "tiktok">("facebook");

  // 2. Fact Inspector Selected Sentence
  const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null);

  // 3. Approval / Rejection States
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectionCategory, setRejectionCategory] = useState<string>(REJECTION_ERROR_CATEGORIES[0].id);
  const [rejectionNote, setRejectionNote] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // 5. Versioning & Diff State
  const [currentVersion, setCurrentVersion] = useState<number>(initialVersion);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Dữ liệu mẫu khởi tạo chuẩn chỉnh cho TripC Da Nang
  const defaultPack: { facebook: ChannelPackData; tiktok: ChannelPackData } = useMemo(
    () => ({
      facebook: {
        channel: "facebook",
        title: "Bí kíp vi vu bán đảo Sơn Trà trọn vẹn 1 ngày",
        hook: "Bạn đã từng ngắm toàn cảnh thành phố Đà Nẵng từ độ cao gần 700m chưa?",
        body: [
          "Bán đảo Sơn Trà cách trung tâm Đà Nẵng chừng 10km về hướng đông bắc.",
          "Chùa Linh Ứng Bãi Bụt sở hữu tượng Phật Bà Quan Âm cao 67m hướng nhìn ra biển Đông.",
          "Đỉnh Bàn Cờ lộng gió là điểm check-in lý tưởng vào sáng sớm hoặc hoàng hôn.",
        ],
        cta: "Lưu lại bài viết này và lên lịch cho chuyến khám phá Đà Nẵng của bạn nhé!",
        hashtags: ["#DaNang2026", "#SonTra", "#TripCDaNang", "#DuLichDaNang"],
        full_caption:
          "Bạn đã từng ngắm toàn cảnh thành phố Đà Nẵng từ độ cao gần 700m chưa?\n\n• Bán đảo Sơn Trà cách trung tâm Đà Nẵng chừng 10km về hướng đông bắc.\n• Chùa Linh Ứng Bãi Bụt sở hữu tượng Phật Bà Quan Âm cao 67m hướng nhìn ra biển Đông.\n• Đỉnh Bàn Cờ lộng gió là điểm check-in lý tưởng vào sáng sớm hoặc hoàng hôn.\n\nLưu lại bài viết này và lên lịch cho chuyến khám phá Đà Nẵng của bạn nhé!\n#DaNang2026 #SonTra #TripCDaNang #DuLichDaNang",
        sentences: [
          {
            sentence_id: "s1",
            sentence_text: "Bạn đã từng ngắm toàn cảnh thành phố Đà Nẵng từ độ cao gần 700m chưa?",
            sentence_type: "hook",
            entailment_status: "ZERO_CLAIM_VERIFIED",
            source_quote: "Câu hỏi gợi mở cảm xúc, không chứa cam kết giá hay tính từ tuyệt đối.",
          },
          {
            sentence_id: "s2",
            sentence_text: "Bán đảo Sơn Trà cách trung tâm Đà Nẵng chừng 10km về hướng đông bắc.",
            sentence_type: "factual",
            fact_id: "F_SONTRA_DIST_01",
            source_quote: "Bán đảo Sơn Trà nằm cách trung tâm thành phố Đà Nẵng khoảng 10 km về phía đông bắc.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#son-tra",
            entailment_status: "ENTAILED",
            confidence: 0.99,
          },
          {
            sentence_id: "s3",
            sentence_text: "Chùa Linh Ứng Bãi Bụt sở hữu tượng Phật Bà Quan Âm cao 67m hướng nhìn ra biển Đông.",
            sentence_type: "factual",
            fact_id: "F_LINHUNG_STATUE_02",
            source_quote: "Tượng Bồ Tát Quán Thế Âm tại Chùa Linh Ứng Bãi Bụt có chiều cao 67 mét.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#chua-linh-ung",
            entailment_status: "ENTAILED",
            confidence: 0.98,
          },
          {
            sentence_id: "s4",
            sentence_text: "Đỉnh Bàn Cờ lộng gió là điểm check-in lý tưởng vào sáng sớm hoặc hoàng hôn.",
            sentence_type: "factual",
            fact_id: "F_BANCO_PEAK_03",
            source_quote: "Đỉnh Bàn Cờ là nơi ngắm bình minh và hoàng hôn được đông đảo du khách ghé thăm.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#dinh-ban-co",
            entailment_status: "ENTAILED",
            confidence: 0.96,
          },
          {
            sentence_id: "s5",
            sentence_text: "Lưu lại bài viết này và lên lịch cho chuyến khám phá Đà Nẵng của bạn nhé!",
            sentence_type: "cta",
            entailment_status: "ZERO_CLAIM_VERIFIED",
            source_quote: "Lời kêu gọi hành động thuần túy chia sẻ, không áp đặt khuyến mãi hay giá cả.",
          },
        ],
        ai_image: {
          url: "https://assets.tripc.vn/media/ai_generated_sontra_sunset_1080x1080.webp",
          prompt: "Panoramic sunset view from Son Tra peninsula looking over Da Nang bay, golden hour, misty mountains, high aesthetic cinematic lighting, no text, no logo, no people face close-up",
          negative_prompt: "text, numbers, price tags, watermarks, corporate logo, real identifiable face, low resolution, blurry",
          model: "Juggernaut XL v9",
          aspect_ratio: "1:1",
          dimensions: "1024x1024",
          ocr_checked: true,
          ocr_text_found: [],
          safety_passed: true,
          sha256_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
      tiktok: {
        channel: "tiktok",
        title: "Kịch bản video ngắn 145 từ: Chinh phục Đỉnh Bàn Cờ",
        hook: "Đừng đến Đà Nẵng nếu bạn chưa biết tọa độ ngắm hoàng hôn đỉnh chóp này!",
        body: [
          "Chỉ mất 20 phút chạy xe máy từ cầu Rồng, bạn sẽ chạm tới Đỉnh Bàn Cờ lộng gió.",
          "Từ đây nhìn xuống, toàn cảnh vịnh biển Đà Nẵng thu trọn vào tầm mắt với sắc cam chiều tuyệt mỹ.",
          "Đặc biệt là bức tượng Đế Thích chơi cờ uy nghiêm trong sương sớm.",
        ],
        cta: "Follow kênh TripC Da Nang để gom trọn cẩm nang khám phá miền Trung!",
        hashtags: ["#TripCDaNang", "#SonTraDaNang", "#TikTokTravel", "#DinhBanCo"],
        full_caption:
          "Đừng đến Đà Nẵng nếu bạn chưa biết tọa độ ngắm hoàng hôn đỉnh chóp này!\n\nChỉ mất 20 phút chạy xe máy từ cầu Rồng, bạn sẽ chạm tới Đỉnh Bàn Cờ lộng gió. Từ đây nhìn xuống, toàn cảnh vịnh biển Đà Nẵng thu trọn vào tầm mắt với sắc cam chiều tuyệt mỹ. Đặc biệt là bức tượng Đế Thích chơi cờ uy nghiêm trong sương sớm.\n\nFollow kênh TripC Da Nang để gom trọn cẩm nang khám phá miền Trung!\n#TripCDaNang #SonTraDaNang #TikTokTravel #DinhBanCo",
        sentences: [
          {
            sentence_id: "tk1",
            sentence_text: "Đừng đến Đà Nẵng nếu bạn chưa biết tọa độ ngắm hoàng hôn đỉnh chóp này!",
            sentence_type: "hook",
            entailment_status: "ZERO_CLAIM_VERIFIED",
            source_quote: "Hook kịch tính kích thích tò mò 3 giây đầu, không chứa khẳng định giá hay giảm giá.",
          },
          {
            sentence_id: "tk2",
            sentence_text: "Chỉ mất 20 phút chạy xe máy từ cầu Rồng, bạn sẽ chạm tới Đỉnh Bàn Cờ lộng gió.",
            sentence_type: "factual",
            fact_id: "F_TRAVEL_TIME_04",
            source_quote: "Thời gian di chuyển từ Cầu Rồng lên Đỉnh Bàn Cờ khoảng 20 phút bằng xe máy.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#duong-di-son-tra",
            entailment_status: "ENTAILED",
            confidence: 0.97,
          },
          {
            sentence_id: "tk3",
            sentence_text: "Từ đây nhìn xuống, toàn cảnh vịnh biển Đà Nẵng thu trọn vào tầm mắt với sắc cam chiều tuyệt mỹ.",
            sentence_type: "factual",
            fact_id: "F_VIEW_BAY_05",
            source_quote: "Điểm ngắm nhìn bao quát toàn bộ vịnh Đà Nẵng từ trên cao.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#dinh-ban-co",
            entailment_status: "ENTAILED",
            confidence: 0.95,
          },
          {
            sentence_id: "tk4",
            sentence_text: "Đặc biệt là bức tượng Đế Thích chơi cờ uy nghiêm trong sương sớm.",
            sentence_type: "factual",
            fact_id: "F_STATUE_DETHICH_06",
            source_quote: "Bức tượng tiên ông Đế Thích đánh cờ gắn liền với truyền thuyết tại đỉnh núi.",
            source_url: "https://tripc.vn/seo/cam-nang-du-lich-da-nang#su-tich-dinh-ban-co",
            entailment_status: "ENTAILED",
            confidence: 0.98,
          },
          {
            sentence_id: "tk5",
            sentence_text: "Follow kênh TripC Da Nang để gom trọn cẩm nang khám phá miền Trung!",
            sentence_type: "cta",
            entailment_status: "ZERO_CLAIM_VERIFIED",
            source_quote: "CTA theo dõi kênh video, không bán hàng trực tiếp.",
          },
        ],
        tiktok_storyboard: [
          {
            scene_number: 1,
            duration_seconds: 3,
            visual_cue: "Flycam FPV bay từ mặt biển vụt lên cung đường uốn lượn Sơn Trà",
            voiceover: "Đừng đến Đà Nẵng nếu bạn chưa biết tọa độ ngắm hoàng hôn đỉnh chóp này!",
            on_screen_text: "Hoàng hôn Đỉnh Bàn Cờ 🌅",
          },
          {
            scene_number: 2,
            duration_seconds: 8,
            visual_cue: "Góc quay POV tay lái xe máy giữa tán rừng nguyên sinh rợp bóng",
            voiceover: "Chỉ mất 20 phút chạy xe máy từ cầu Rồng, bạn sẽ chạm tới Đỉnh Bàn Cờ lộng gió.",
            on_screen_text: "20 phút từ Cầu Rồng 🛵",
          },
          {
            scene_number: 3,
            duration_seconds: 12,
            visual_cue: "Toàn cảnh panorama vịnh biển hoàng hôn nhuộm màu cam rực rỡ + tượng Đế Thích",
            voiceover: "Từ đây nhìn xuống, toàn cảnh vịnh biển Đà Nẵng thu trọn vào tầm mắt với sắc cam chiều tuyệt mỹ.",
            on_screen_text: "View 360 độ cực chill ✨",
          },
          {
            scene_number: 4,
            duration_seconds: 5,
            visual_cue: "Logo TripC Da Nang xuất hiện mượt mà cùng nút bấm Follow chuyển động",
            voiceover: "Follow kênh TripC Da Nang để gom trọn cẩm nang khám phá miền Trung!",
            on_screen_text: "Follow @TripCDaNang 📍",
          },
        ],
        ai_image: {
          url: "https://assets.tripc.vn/media/ai_generated_tiktok_cover_1080x1920.webp",
          prompt: "Vertical 9:16 mobile video poster, sunset overlooking Da Nang coastal city from Son Tra mountain peak, dramatic clouds, cinematic golden hour lighting, no text, no watermark",
          negative_prompt: "text, numbers, price tags, watermarks, face close up, blurry",
          model: "Juggernaut XL v9",
          aspect_ratio: "9:16",
          dimensions: "768x1344",
          ocr_checked: true,
          ocr_text_found: [],
          safety_passed: true,
          sha256_hash: "a4f89d99c43b37a111a80c98fec1512da341492ba6ef4360e7e127909a34bc31",
        },
      },
    }),
    []
  );

  const channelData: ChannelPackData = (initialData || defaultPack)[selectedChannel];

  // Trạng thái nội dung đang biên tập và lịch sử các version
  const [editableText, setEditableText] = useState<string>(channelData.full_caption);
  const [lockedHash, setLockedHash] = useState<string>("");
  const [versionHistory, setVersionHistory] = useState<VersionRecord[]>([
    {
      version: 1,
      author_type: "ai",
      author_name: "Content Marketing Agent (Claude 3.5 Sonnet)",
      content_hash: "76b9de5c79b651a9b63606c00ec45bd96f473308f01a3387d78bb1f8be42351c",
      caption_text: channelData.full_caption,
      created_at: new Date().toISOString(),
    },
  ]);

  // 6. Dynamic AI Image State per channel
  const [channelImageStates, setChannelImageStates] = useState<{
    facebook: ImageJobUiState;
    tiktok: ImageJobUiState;
  }>(() => {
    const fbInitial = (initialData || defaultPack).facebook;
    const ttInitial = (initialData || defaultPack).tiktok;

    const computeInitialStatus = (hasUrl: boolean): ImageJobDisplayStatus => {
      if (initialImageStatus) return initialImageStatus;
      return hasUrl ? "completed" : "image_pending";
    };

    return {
      facebook: {
        status: computeInitialStatus(Boolean(fbInitial.ai_image?.url)),
        job_id: initialImageJobId || null,
        gpu_online: initialGpuOnline,
        image_url: initialImageStatus && initialImageStatus !== "completed" ? null : fbInitial.ai_image?.url || null,
        content_hash: initialImageStatus && initialImageStatus !== "completed" ? null : fbInitial.ai_image?.sha256_hash || null,
        media_asset_id: null,
        error_code: null,
        error_message: null,
        message: null,
        prompt: fbInitial.ai_image?.prompt || "",
        model_name: "Juggernaut XL v9",
        seed: 428192,
        dimensions: fbInitial.ai_image?.dimensions || "1024x1024",
        aspect_ratio: "1:1",
        ocr_checked: fbInitial.ai_image?.ocr_checked ?? true,
        safety_passed: fbInitial.ai_image?.safety_passed ?? true,
      },
      tiktok: {
        status: computeInitialStatus(Boolean(ttInitial.ai_image?.url)),
        job_id: null,
        gpu_online: initialGpuOnline,
        image_url: initialImageStatus && initialImageStatus !== "completed" ? null : ttInitial.ai_image?.url || null,
        content_hash: initialImageStatus && initialImageStatus !== "completed" ? null : ttInitial.ai_image?.sha256_hash || null,
        media_asset_id: null,
        error_code: null,
        error_message: null,
        message: null,
        prompt: ttInitial.ai_image?.prompt || "",
        model_name: "Juggernaut XL v9",
        seed: 893122,
        dimensions: ttInitial.ai_image?.dimensions || "768x1344",
        aspect_ratio: "9:16",
        ocr_checked: ttInitial.ai_image?.ocr_checked ?? true,
        safety_passed: ttInitial.ai_image?.safety_passed ?? true,
      },
    };
  });

  const currentImageState = channelImageStates[selectedChannel];
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Gating rule: Không cho duyệt hoặc đăng bài khi ảnh còn pending nếu bài bắt buộc có ảnh
  const isImagePending =
    currentImageState.status === "image_pending" ||
    currentImageState.status === "queued" ||
    currentImageState.status === "claimed" ||
    currentImageState.status === "running" ||
    currentImageState.status === "uploaded" ||
    currentImageState.status === "reviewing";

  const isImageIncomplete =
    isImagePending ||
    currentImageState.status === "needs_assets" ||
    currentImageState.status === "failed" ||
    currentImageState.status === "cancelled";

  const isApprovalBlocked = requiresImage && isImageIncomplete;

  // 7. Polling with Exponential Backoff
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const activeJobId = currentImageState.job_id;
    if (!activeJobId) return;

    const terminalStatuses: ImageJobDisplayStatus[] = ["completed", "needs_assets", "failed", "cancelled"];
    if (terminalStatuses.includes(currentImageState.status)) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let isSubscribed = true;
    let currentDelay = 2000;
    const maxDelay = 10000;
    const backoffFactor = 1.5;

    const poll = async () => {
      try {
        const fetchFn = fetchImageJob || defaultFetchImageJob;
        const job = await fetchFn(activeJobId);
        if (!isSubscribed) return;

        if (job) {
          const nextStatus = (job.status as ImageJobDisplayStatus) || currentImageState.status;
          setChannelImageStates((prev) => ({
            ...prev,
            [selectedChannel]: {
              ...prev[selectedChannel],
              status: nextStatus,
              gpu_online: job.gpu_online !== undefined ? Boolean(job.gpu_online) : prev[selectedChannel].gpu_online,
              image_url: job.image_url !== undefined ? job.image_url : prev[selectedChannel].image_url,
              content_hash: job.content_hash !== undefined ? job.content_hash : prev[selectedChannel].content_hash,
              media_asset_id: job.media_asset_id !== undefined ? job.media_asset_id : prev[selectedChannel].media_asset_id,
              error_code: job.error_code !== undefined ? job.error_code : prev[selectedChannel].error_code,
              error_message: job.error_message !== undefined ? job.error_message : prev[selectedChannel].error_message,
              message: job.message !== undefined ? job.message : prev[selectedChannel].message,
              seed: job.seed !== undefined ? job.seed : prev[selectedChannel].seed,
            },
          }));

          if (terminalStatuses.includes(nextStatus)) {
            return;
          }
        }
      } catch (err) {
        console.warn("Error polling image job:", err);
      }

      if (isSubscribed) {
        currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
        pollTimerRef.current = setTimeout(poll, currentDelay);
      }
    };

    pollTimerRef.current = setTimeout(poll, currentDelay);

    return () => {
      isSubscribed = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [currentImageState.job_id, currentImageState.status, selectedChannel, fetchImageJob]);

  // Hành động: Tạo lại ảnh (Re-generate Image)
  const handleRegenerateImage = async () => {
    setClickCount((c) => c + 1);
    setIsRegenerating(true);
    setActionNotice(null);

    const targetAspectRatio: "1:1" | "9:16" = selectedChannel === "facebook" ? "1:1" : "9:16";
    const prompt = currentImageState.prompt || channelData.ai_image?.prompt || "Ảnh minh họa du lịch Đà Nẵng";
    const newSeed = Math.floor(Math.random() * 2147483647) + 1;

    try {
      const createFn = createImageJobFn || defaultCreateImageJob;
      const res = await createFn({
        workspace_id: workspaceId,
        post_id: postId,
        prompt,
        negative_prompt: channelData.ai_image?.negative_prompt,
        aspect_ratio: targetAspectRatio,
        seed: newSeed,
      });

      const newJobId = res.job_id || res.id || `job_${Date.now()}`;
      const gpuOnlineStatus = res.gpu_online ?? true;

      setChannelImageStates((prev) => ({
        ...prev,
        [selectedChannel]: {
          ...prev[selectedChannel],
          job_id: newJobId,
          status: (res.status as ImageJobDisplayStatus) || "queued",
          gpu_online: gpuOnlineStatus,
          seed: newSeed,
          error_code: null,
          error_message: null,
          image_url: null,
          content_hash: null,
        },
      }));

      setActionNotice({
        type: "success",
        msg: `Đã gửi yêu cầu tạo lại ảnh mới (Job: ${newJobId.slice(0, 8)}..., Seed: ${newSeed}).`,
      });
    } catch (err: any) {
      setActionNotice({
        type: "error",
        msg: `Không thể tạo lại ảnh: ${err?.message || "Lỗi kết nối máy chủ"}`,
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Hành động: Hủy yêu cầu sinh ảnh khi còn queued
  const handleCancelImageJob = async () => {
    const activeJobId = currentImageState.job_id;
    if (!activeJobId) {
      setChannelImageStates((prev) => ({
        ...prev,
        [selectedChannel]: {
          ...prev[selectedChannel],
          status: "cancelled",
        },
      }));
      return;
    }

    setClickCount((c) => c + 1);
    setIsCancelling(true);
    try {
      const cancelFn = cancelImageJobFn || defaultCancelImageJob;
      await cancelFn(activeJobId);

      setChannelImageStates((prev) => ({
        ...prev,
        [selectedChannel]: {
          ...prev[selectedChannel],
          status: "cancelled",
        },
      }));

      setActionNotice({
        type: "info",
        msg: `Đã hủy tác vụ sinh ảnh (${activeJobId.slice(0, 8)}...).`,
      });
    } catch (err: any) {
      setActionNotice({
        type: "error",
        msg: `Không thể hủy tác vụ: ${err?.message || "Lỗi máy chủ"}`,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Kiểm tra RBAC
  const canApprove = userRole === "owner" || userRole === "editor";

  // Active cited fact khi bấm vào câu
  const activeSentence = useMemo(() => {
    return channelData.sentences.find((s) => s.sentence_id === activeSentenceId) || null;
  }, [channelData.sentences, activeSentenceId]);

  // Hành động 1: Approve (Khóa Hash & Version - CM-26)
  const handleApprove = async () => {
    if (!canApprove) {
      setActionNotice({
        type: "error",
        msg: `RBAC Từ chối: Vai trò '${userRole}' không có quyền phê duyệt. Chỉ Owner hoặc Editor mới có quyền.`,
      });
      return;
    }

    if (isApprovalBlocked) {
      setActionNotice({
        type: "error",
        msg: "Không thể phê duyệt bài viết khi ảnh đang trong quá trình tạo (image pending). Vui lòng đợi hoàn tất hoặc hủy tác vụ ảnh.",
      });
      return;
    }

    if (requiresImage && currentImageState.status === "needs_assets") {
      setActionNotice({
        type: "error",
        msg: "Bài viết này yêu cầu ảnh chụp thực tế. Vui lòng chọn hoặc tải ảnh thật từ kho tài nguyên trước khi duyệt.",
      });
      return;
    }

    if (requiresImage && currentImageState.status === "failed") {
      setActionNotice({
        type: "error",
        msg: "Ảnh minh họa đang bị lỗi. Vui lòng tạo lại ảnh thành công trước khi duyệt.",
      });
      return;
    }

    try {
      const computedHash = await computeSha256Client(editableText);
      setLockedHash(computedHash);
      setStatus("approved");
      setActionNotice({
        type: "success",
        msg: `ĐÃ PHÊ DUYỆT THÀNH CÔNG! Đã khóa mã băm SHA-256 (${computedHash.slice(0, 16)}...) và Target Version (v${currentVersion}).`,
      });

      if (onApproveSuccess) {
        onApproveSuccess({
          target_version: currentVersion,
          target_hash: computedHash,
          approved_by_role: userRole,
          image_asset_id: currentImageState.media_asset_id || null,
          image_content_hash: currentImageState.content_hash || null,
        });
      }
    } catch {
      setActionNotice({ type: "error", msg: "Lỗi trong quá trình tính toán mã băm phê duyệt." });
    }
  };

  // Hành động 2: Mở modal Reject
  const handleOpenRejectModal = () => {
    if (!canApprove) {
      setActionNotice({
        type: "error",
        msg: `RBAC Từ chối: Vai trò '${userRole}' không có quyền từ chối bài.`,
      });
      return;
    }
    setShowRejectModal(true);
  };

  // Hành động 2b: Xác nhận từ chối với lý do
  const handleConfirmReject = () => {
    setStatus("rejected");
    setShowRejectModal(false);
    const categoryObj = REJECTION_ERROR_CATEGORIES.find((c) => c.id === rejectionCategory);
    const reasonText = `${categoryObj?.label || rejectionCategory}${rejectionNote ? `: ${rejectionNote}` : ""}`;

    setActionNotice({
      type: "info",
      msg: `ĐÃ TỪ CHỐI DUYỆT. Lý do: ${reasonText}`,
    });

    if (onRejectSuccess) {
      onRejectSuccess({
        reason_category: rejectionCategory,
        review_note: rejectionNote,
      });
    }
  };

  // Hành động 3: Bật/Tắt chế độ Edit
  const handleToggleEdit = () => {
    setIsEditing((prev) => !prev);
  };

  // Hành động 3b: Lưu bản chỉnh sửa của người (Tạo version mới và lưu Diff)
  const handleSaveEdit = async () => {
    const newVersionNum = currentVersion + 1;
    const computedHash = await computeSha256Client(editableText);

    const oldWords = new Set(channelData.full_caption.split(/\s+/));
    const newWords = new Set(editableText.split(/\s+/));

    const added = Array.from(newWords).filter((w) => !oldWords.has(w));
    const removed = Array.from(oldWords).filter((w) => !newWords.has(w));

    const newRecord: VersionRecord = {
      version: newVersionNum,
      author_type: "human",
      author_name: `Chuyên viên duyệt (${userRole.toUpperCase()})`,
      content_hash: computedHash,
      caption_text: editableText,
      diff_from_previous: {
        added_words: added.slice(0, 10),
        removed_words: removed.slice(0, 10),
        summary: `Sửa đổi ${added.length} từ mới, xóa ${removed.length} từ so với bản AI sinh.`,
      },
      created_at: new Date().toISOString(),
    };

    setVersionHistory((prev) => [newRecord, ...prev]);
    setCurrentVersion(newVersionNum);
    setIsEditing(false);
    setStatus("pending");

    setActionNotice({
      type: "success",
      msg: `ĐÃ TẠO PHIÊN BẢN MỚI v${newVersionNum}! Đã ghi nhận lịch sử Diff và mã băm mới (${computedHash.slice(0, 16)}...).`,
    });

    if (onEditSaveSuccess) {
      onEditSaveSuccess(newRecord);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 font-sans text-slate-800">
      {/* ── HEADER & RBAC BAR ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              {workspaceName}
            </span>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Target Version: v{currentVersion}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              Parent SEO: v{initialParentSeoVersion}
            </span>
            {lockedHash && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                🔒 Hash Locked: {lockedHash.slice(0, 12)}...
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
            CM-25: Cổng Phê Duyệt Nội Dung Đa Kênh (Approval Queue)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quy trình Human-in-the-Loop tối ưu: Duyệt bài trong ≤3 lượt click · Fact Inspector đối chứng từng câu · Khóa mã băm SHA-256 bất biến.
          </p>
        </div>

        {/* User Role Badge & Status */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400 font-semibold uppercase">Quyền hạn truy cập</div>
            <div className="flex items-center gap-1.5 justify-end mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  canApprove ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                {userRole}
              </span>
            </div>
          </div>

          {/* Status Pill */}
          <div className="pl-3 border-l border-slate-200">
            {status === "pending" && (
              <span className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                ⏳ Chờ Duyệt
              </span>
            )}
            {status === "approved" && (
              <span className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✅ Đã Duyệt & Khóa Hash
              </span>
            )}
            {status === "rejected" && (
              <span className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                ❌ Đã Từ Chối
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── NOTIFICATION ALERT ── */}
      {actionNotice && (
        <div
          data-testid="approval-action-notice"
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between border ${
            actionNotice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : actionNotice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{actionNotice.type === "success" ? "🎉" : actionNotice.type === "error" ? "⚠️" : "ℹ️"}</span>
            <span>{actionNotice.msg}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-xs opacity-60 hover:opacity-100 px-2 py-1 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* ── CHANNEL TABS & WORKFLOW ACTION BAR ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
        {/* Channel Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setSelectedChannel("facebook");
            }}
            data-testid="channel-facebook-tab"
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              selectedChannel === "facebook"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook Pack (3 Phần + Ảnh)
          </button>

          <button
            onClick={() => {
              setSelectedChannel("tiktok");
            }}
            data-testid="channel-tiktok-tab"
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              selectedChannel === "tiktok"
                ? "bg-black text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
            </svg>
            TikTok Script (120-180 từ)
          </button>
        </div>

        {/* 3-Click Action Group */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
          {/* Cảnh báo nếu đang pending ảnh và bắt buộc có ảnh */}
          {isApprovalBlocked && (
            <div
              data-testid="approval-blocked-badge"
              className="text-xs text-amber-800 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl flex items-center gap-2 font-medium"
            >
              <span className="text-amber-600">⏳</span>
              <span>
                {isImagePending
                  ? "Không thể duyệt bài khi ảnh đang chờ tạo (image pending)."
                  : currentImageState.status === "needs_assets"
                  ? "Bài viết yêu cầu bổ sung ảnh thật trước khi duyệt."
                  : currentImageState.status === "failed"
                  ? "Không thể duyệt bài khi ảnh bị lỗi tạo."
                  : "Không thể duyệt bài khi chưa có ảnh hợp lệ."}
              </span>
            </div>
          )}

          <button
            onClick={handleToggleEdit}
            disabled={status === "approved"}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              isEditing
                ? "bg-amber-500 text-white border-amber-600"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            }`}
          >
            ✏️ {isEditing ? "Hủy Sửa" : "Edit Nội Dung"}
          </button>

          <button
            onClick={handleOpenRejectModal}
            disabled={status === "approved" || !canApprove}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            ❌ Reject (Từ chối)
          </button>

          <button
            data-testid="approve-btn"
            onClick={handleApprove}
            disabled={status === "approved" || !canApprove || isApprovalBlocked}
            title={
              isApprovalBlocked
                ? "Không thể duyệt bài khi ảnh đang chờ tạo (image pending)"
                : "Phê duyệt bài viết"
            }
            className="px-6 py-2.5 rounded-xl text-sm font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
          >
            ✅ Approve (Duyệt ≤3 click)
          </button>

          {onPublishClick && (
            <button
              data-testid="publish-btn"
              onClick={() => {
                if (isApprovalBlocked) {
                  setActionNotice({
                    type: "error",
                    msg: "Không thể đăng bài khi ảnh đang chờ tạo.",
                  });
                  return;
                }
                onPublishClick();
              }}
              disabled={status !== "approved" || isApprovalBlocked}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              🚀 Đăng bài (Publish)
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── CỘT TRÁI: CAPTION & TÔ SÁNG FACT INSPECTOR (7 CỘT) ── */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedChannel === "facebook" ? "Bài Viết Facebook 3 Phần" : "Kịch Bản TikTok 120-180 Từ"}
                </h3>
                <p className="text-xs text-slate-500">
                  Nhấp vào từng câu có gạch chân màu ngọc bích để soi nguồn dẫn chứng tại Fact Inspector.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-mono">
                {channelData.sentences.length} câu đã kiểm định
              </span>
            </div>

            {/* Chế độ Sửa (Edit Mode) */}
            {isEditing ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  rows={10}
                  className="w-full p-4 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-500 font-sans text-sm text-slate-800 leading-relaxed"
                  placeholder="Chỉnh sửa nội dung tại đây..."
                />
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Số từ hiện tại: {editableText.trim().split(/\s+/).length} từ</span>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700 cursor-pointer"
                  >
                    💾 Lưu Thay Đổi & Tạo Version {currentVersion + 1}
                  </button>
                </div>
              </div>
            ) : (
              /* Chế độ Xem & Fact Inspector Highlighter */
              <div className="mt-5 space-y-4 text-slate-800 leading-relaxed text-sm">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  {channelData.sentences.map((sent) => {
                    const isSelected = activeSentenceId === sent.sentence_id;
                    const isFactual = sent.sentence_type === "factual";
                    const isHookOrCta = sent.sentence_type === "hook" || sent.sentence_type === "cta";

                    return (
                      <span
                        key={sent.sentence_id}
                        onClick={() => {
                          setActiveSentenceId(sent.sentence_id);
                        }}
                        className={`inline-block cursor-pointer px-1.5 py-0.5 rounded transition-all duration-150 mr-1.5 mb-1 ${
                          isSelected
                            ? "bg-emerald-200 text-emerald-950 ring-2 ring-emerald-500 font-medium"
                            : isFactual
                            ? "bg-emerald-50 text-emerald-900 border-b-2 border-emerald-400 hover:bg-emerald-100"
                            : isHookOrCta
                            ? "bg-blue-50 text-blue-900 border-b-2 border-blue-300 hover:bg-blue-100"
                            : "hover:bg-slate-200"
                        }`}
                        title={isFactual ? `Fact ID: ${sent.fact_id} (Nhấp để soi)` : "Zero-Claim Verified"}
                      >
                        {sent.sentence_text}
                        {sent.fact_id && (
                          <span className="ml-1 text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-600 text-white font-bold">
                            [{sent.fact_id.split("_")[1] || "F"}]
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Hashtag List */}
                <div className="pt-2 flex flex-wrap gap-2">
                  {channelData.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-blue-700 border border-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── BẢNG SOI FACT INSPECTOR CHI TIẾT ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <span>🔍</span> Fact Inspector (Trích Lục Dẫn Chứng)
            </h4>

            {activeSentence ? (
              <div className="mt-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                    {activeSentence.fact_id || "ZERO_CLAIM_STATEMENT"}
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-600 text-white text-[11px]">
                    {activeSentence.entailment_status}
                  </span>
                </div>

                <div>
                  <div className="text-slate-500 font-semibold">Câu trong bài Social:</div>
                  <div className="text-slate-900 font-medium italic mt-0.5">
                    "{activeSentence.sentence_text}"
                  </div>
                </div>

                {activeSentence.source_quote && (
                  <div>
                    <div className="text-slate-500 font-semibold">Dẫn chứng nguyên bản bài SEO nguồn:</div>
                    <div className="text-emerald-950 font-mono bg-white/80 p-2.5 rounded-lg border border-emerald-200 mt-1">
                      "{activeSentence.source_quote}"
                    </div>
                  </div>
                )}

                {activeSentence.source_url && (
                  <div className="text-[11px] text-slate-500 truncate">
                    Nguồn URL:{" "}
                    <a
                      href={activeSentence.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-mono"
                    >
                      {activeSentence.source_url}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                Nhấp vào bất kỳ câu nào ở trên để xem đối chiếu nguồn dẫn chứng gốc và độ tin cậy NLI.
              </div>
            )}
          </div>

          {/* ── LỊCH SỬ PHIÊN BẢN VÀ DIFF (NẾU CÓ EDIT) ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <span>📜</span> Lịch Sử Phiên Bản & Diff So Khớp
            </h4>

            <div className="mt-3 space-y-3">
              {versionHistory.map((rec) => (
                <div
                  key={rec.version}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col gap-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Phiên bản v{rec.version} · {rec.author_name}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {new Date(rec.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 truncate">
                    SHA-256: {rec.content_hash}
                  </div>

                  {rec.diff_from_previous && (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                      <div className="font-bold">{rec.diff_from_previous.summary}</div>
                      {rec.diff_from_previous.added_words.length > 0 && (
                        <div>
                          <span className="font-bold text-emerald-700">+ Thêm mới: </span>
                          <span className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-mono">
                            {rec.diff_from_previous.added_words.join(", ")}
                          </span>
                        </div>
                      )}
                      {rec.diff_from_previous.removed_words.length > 0 && (
                        <div>
                          <span className="font-bold text-rose-700">- Đã xóa: </span>
                          <span className="bg-rose-100 text-rose-800 px-1 py-0.5 rounded line-through font-mono">
                            {rec.diff_from_previous.removed_words.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CỘT PHẢI: ẢNH AI KÈM NHÃN & CÁC TRẠNG THÁI (5 CỘT) ── */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4" data-testid="ai-image-section">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Hình Ảnh Minh Họa</h3>
              {/* STATUS BADGE */}
              {currentImageState.status === "completed" && (
                <span
                  data-testid="ai-badge-completed"
                  className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1.5 shadow-2xs"
                >
                  <span>✨</span> [Ảnh tạo bởi AI]
                </span>
              )}
              {(currentImageState.status === "image_pending" || currentImageState.status === "queued") && (
                <span
                  data-testid="ai-badge-pending"
                  className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 animate-pulse"
                >
                  <span>⏳</span> Đang chờ tạo ảnh
                </span>
              )}
              {(currentImageState.status === "running" ||
                currentImageState.status === "claimed" ||
                currentImageState.status === "uploaded" ||
                currentImageState.status === "reviewing") && (
                <span
                  data-testid="ai-badge-running"
                  className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                  Đang xử lý GPU
                </span>
              )}
              {currentImageState.status === "needs_assets" && (
                <span
                  data-testid="ai-badge-needs-assets"
                  className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5"
                >
                  <span>⚠️</span> Cần ảnh thật
                </span>
              )}
              {currentImageState.status === "failed" && (
                <span
                  data-testid="ai-badge-failed"
                  className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1.5"
                >
                  <span>❌</span> Lỗi tạo ảnh
                </span>
              )}
              {currentImageState.status === "cancelled" && (
                <span
                  data-testid="ai-badge-cancelled"
                  className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1.5"
                >
                  <span>🚫</span> Đã hủy
                </span>
              )}
            </div>

            {/* 1. TRẠNG THÁI COMPLETED: Hiển thị ảnh đầy đủ bằng MediaAssetImage */}
            {currentImageState.status === "completed" && (
              <div className="space-y-4" data-testid="image-completed-container">
                <MediaAssetImage
                  asset={{
                    url: currentImageState.image_url,
                    alt_text: `Ảnh minh họa AI cho bài ${selectedChannel.toUpperCase()}: ${currentImageState.prompt}`,
                    is_ai_generated: true,
                    source_type: "ai_generated",
                    model_name: currentImageState.model_name,
                    seed: currentImageState.seed,
                    width: currentImageState.aspect_ratio === "1:1" ? 1024 : 768,
                    height: currentImageState.aspect_ratio === "1:1" ? 1024 : 1344,
                    content_hash: currentImageState.content_hash,
                  }}
                  aspectRatio={currentImageState.aspect_ratio}
                  containerClassName="w-full shadow-sm max-h-[420px]"
                  showCaption={true}
                />

                {/* Metadata Card */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Mô hình AI:</span>
                    <span className="font-mono font-bold text-slate-800">{currentImageState.model_name}</span>
                  </div>
                  {currentImageState.seed !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Seed:</span>
                      <code className="font-mono font-bold text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded">
                        {currentImageState.seed}
                      </code>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Kích thước:</span>
                    <span className="font-mono text-slate-700">
                      {currentImageState.dimensions} ({currentImageState.aspect_ratio})
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">OCR Guardrail (Chữ/Giá):</span>
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      {currentImageState.ocr_checked ? "Đạt (0 chữ/số)" : "Chưa quét"}
                    </span>
                  </div>
                  {currentImageState.content_hash && (
                    <div className="pt-1 border-t border-slate-200 flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">SHA-256 Hash:</span>
                      <span className="font-mono text-slate-600 truncate max-w-[200px]" title={currentImageState.content_hash}>
                        {currentImageState.content_hash}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action button: Tạo lại ảnh */}
                <button
                  type="button"
                  data-testid="regenerate-image-btn"
                  onClick={handleRegenerateImage}
                  disabled={isRegenerating}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>🔄</span>
                  <span>{isRegenerating ? "Đang gửi yêu cầu..." : "Tạo lại ảnh (Đổi Seed mới)"}</span>
                </button>
              </div>
            )}

            {/* 2. TRẠNG THÁI IMAGE_PENDING / QUEUED */}
            {(currentImageState.status === "image_pending" || currentImageState.status === "queued") && (
              <div
                data-testid="image-pending-state"
                className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-4"
              >
                <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-600 animate-spin mx-auto" />
                <div>
                  <div className="text-sm font-bold text-slate-800">
                    Tác vụ đang nằm trong hàng đợi sinh ảnh...
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto line-clamp-2">
                    "{currentImageState.prompt}"
                  </p>
                </div>

                {/* Cảnh báo rõ khi gpu_online = false */}
                {!currentImageState.gpu_online && (
                  <div
                    data-testid="gpu-offline-warning"
                    className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 text-left"
                  >
                    <span className="text-base leading-none">⚠️</span>
                    <div>
                      <div className="font-bold text-amber-950">
                        đang chờ máy GPU (hiện chưa có máy trạm online)
                      </div>
                      <p className="mt-1 text-amber-800 leading-relaxed">
                        Hệ thống đã xếp yêu cầu vào hàng đợi. Máy trạm GPU cục bộ hiện đang ngoại tuyến hoặc bận. Ảnh sẽ tự động được khuếch tán ngay khi máy trạm kết nối lại.
                      </p>
                    </div>
                  </div>
                )}

                {/* NÚT HỦY KHI CÒN QUEUED */}
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    data-testid="cancel-image-job-btn"
                    onClick={handleCancelImageJob}
                    disabled={isCancelling}
                    className="px-4 py-2 bg-white text-rose-600 border border-rose-300 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <span>✕</span>
                    <span>{isCancelling ? "Đang hủy..." : "Hủy yêu cầu sinh ảnh"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. TRẠNG THÁI RUNNING / CLAIMED */}
            {(currentImageState.status === "running" ||
              currentImageState.status === "claimed" ||
              currentImageState.status === "uploaded" ||
              currentImageState.status === "reviewing") && (
              <div
                data-testid="image-running-state"
                className="p-6 text-center bg-blue-50/60 rounded-xl border border-blue-200 space-y-4"
              >
                <div className="relative w-14 h-14 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-xl">⚡</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-950">
                    Máy trạm GPU đang thực hiện khuếch tán hình ảnh...
                  </div>
                  <p className="text-xs text-blue-800 mt-1 max-w-sm mx-auto leading-relaxed">
                    Đang chạy mô hình Juggernaut XL v9 (30 steps, Euler Ancestral). Quá trình mất khoảng 15-30 giây.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Trạng thái: <span className="font-bold text-blue-800 uppercase">{currentImageState.status}</span>
                </div>
              </div>
            )}

            {/* 4. TRẠNG THÁI NEEDS_ASSETS (Nhắc dùng ảnh thật) */}
            {currentImageState.status === "needs_assets" && (
              <div
                data-testid="image-needs-assets-state"
                className="p-5 bg-amber-50/90 border-2 border-amber-300 rounded-xl text-left space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center text-xl shrink-0">
                    ⚠️
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-amber-950">
                      Yêu cầu sử dụng ảnh chụp thực tế từ kho tài nguyên
                    </h4>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      Không thể tạo ảnh hợp lệ do vi phạm tiêu chuẩn chính sách (phát hiện giá/chữ qua OCR) hoặc đã đạt giới hạn thử lại tối đa. Vui lòng tải lên hoặc chọn ảnh chụp thực tế của doanh nghiệp.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white/80 rounded-lg border border-amber-200 text-xs text-slate-700 space-y-1">
                  <div className="font-semibold text-slate-800">Gợi ý hành động:</div>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li>Chọn ảnh phòng / món ăn / dịch vụ thật từ kho Media Assets</li>
                    <li>Tải lên hình ảnh thực tế có độ phân giải cao</li>
                    <li>Hoặc bấm "Tạo lại ảnh AI" để thử lại với seed ngẫu nhiên mới</li>
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    data-testid="use-real-asset-btn"
                    onClick={() => {
                      setActionNotice({
                        type: "info",
                        msg: "Đã mở ngăn chọn ảnh thật từ kho tài nguyên doanh nghiệp (Media Assets).",
                      });
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>📁</span>
                    <span>Chọn ảnh thật từ kho</span>
                  </button>

                  <button
                    type="button"
                    data-testid="regenerate-image-btn"
                    onClick={handleRegenerateImage}
                    disabled={isRegenerating}
                    className="px-4 py-2 bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>🔄</span>
                    <span>{isRegenerating ? "Đang gửi..." : "Tạo lại ảnh AI"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. TRẠNG THÁI FAILED */}
            {currentImageState.status === "failed" && (
              <div
                data-testid="image-failed-state"
                className="p-5 bg-rose-50/90 border-2 border-rose-300 rounded-xl text-left space-y-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 text-rose-800 flex items-center justify-center text-xl shrink-0">
                    ❌
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-rose-950">
                      Quá trình sinh ảnh thất bại
                    </h4>
                    <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                      {currentImageState.error_message || "Máy trạm GPU gặp sự cố kỹ thuật trong quá trình khuếch tán hình ảnh."}
                    </p>
                  </div>
                </div>

                {currentImageState.error_code && (
                  <div className="p-2.5 bg-white/90 rounded-lg border border-rose-200 text-xs font-mono text-rose-900 flex items-center justify-between">
                    <span className="text-slate-500 font-sans">Mã lỗi:</span>
                    <span className="font-bold">{currentImageState.error_code}</span>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    data-testid="regenerate-image-btn"
                    onClick={handleRegenerateImage}
                    disabled={isRegenerating}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>🔄</span>
                    <span>{isRegenerating ? "Đang thử lại..." : "Tạo lại ảnh"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. TRẠNG THÁI CANCELLED */}
            {currentImageState.status === "cancelled" && (
              <div
                data-testid="image-cancelled-state"
                className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3"
              >
                <div className="text-2xl">🚫</div>
                <div className="text-sm font-bold text-slate-800">Tác vụ sinh ảnh đã bị hủy</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Yêu cầu đã được thu hồi an toàn khỏi hàng đợi máy trạm.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    data-testid="regenerate-image-btn"
                    onClick={handleRegenerateImage}
                    disabled={isRegenerating}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>✨</span>
                    <span>Tạo ảnh mới</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* TikTok Storyboard View (Nếu là kênh TikTok) */}
          {selectedChannel === "tiktok" && channelData.tiktok_storyboard && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🎬</span> Phân Cảnh Storyboard (TikTok)
              </h3>
              <div className="space-y-3">
                {channelData.tiktok_storyboard.map((scene) => (
                  <div
                    key={scene.scene_number}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">
                        Cảnh {scene.scene_number} ({scene.duration_seconds}s)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {scene.on_screen_text}
                      </span>
                    </div>
                    <div className="text-slate-600">
                      <span className="font-semibold text-slate-500">Hình ảnh: </span>
                      {scene.visual_cue}
                    </div>
                    <div className="text-slate-800 italic">
                      <span className="font-semibold text-slate-500 not-italic">Lời đọc: </span>
                      "{scene.voiceover}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL REJECT (CHỌN LÝ DO TỪ DANH SÁCH LOẠI LỖI) ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Từ Chối Duyệt Nội Dung</h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Vui lòng chọn loại lỗi vi phạm từ danh mục chuẩn hóa để hệ thống phân loại và phản hồi vòng lặp sửa tự động (Reflection Loop).
            </p>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-700">Loại lỗi vi phạm chính:</label>
              <select
                value={rejectionCategory}
                onChange={(e) => setRejectionCategory(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
              >
                {REJECTION_ERROR_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>

              <label className="block font-bold text-slate-700 pt-2">Ghi chú cụ thể của chuyên viên:</label>
              <textarea
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                rows={3}
                placeholder="Mô tả cụ thể câu hoặc chi tiết vi phạm để Agent sửa..."
                className="w-full p-3 rounded-xl border border-slate-300 text-slate-800 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-5 py-2 rounded-xl text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer"
              >
                Xác Nhận Từ Chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
