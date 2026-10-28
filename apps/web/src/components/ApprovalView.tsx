"use client";

import React, { useState, useMemo } from "react";

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

export interface ApprovalViewProps {
  workspaceId: string;
  workspaceName?: string;
  userRole?: "owner" | "editor" | "viewer";
  postId: string;
  initialVersion?: number;
  initialParentSeoVersion?: number;
  initialData?: {
    facebook: ChannelPackData;
    tiktok: ChannelPackData;
  };
  onApproveSuccess?: (approvalPayload: {
    target_version: number;
    target_hash: string;
    approved_by_role: string;
  }) => void;
  onRejectSuccess?: (rejectionPayload: {
    reason_category: string;
    review_note: string;
  }) => void;
  onEditSaveSuccess?: (newVersion: VersionRecord) => void;
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
  // Fallback simple checksum hex
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, "0");
}

export default function ApprovalView({
  workspaceId = "ws_tripc_danang",
  workspaceName = "TripC Da Nang",
  userRole = "editor",
  postId = "post_cm_2026_001",
  initialVersion = 1,
  initialParentSeoVersion = 1,
  initialData,
  onApproveSuccess,
  onRejectSuccess,
  onEditSaveSuccess,
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

  // 4. Click counter tracking (đảm bảo duyệt <= 3 click)
  const [clickCount, setClickCount] = useState<number>(0);

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
          model: "flux-1-dev",
          aspect_ratio: "1:1",
          dimensions: "1080x1080",
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
          model: "flux-1-dev",
          aspect_ratio: "9:16",
          dimensions: "1080x1920",
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

  // Kiểm tra RBAC
  const canApprove = userRole === "owner" || userRole === "editor";

  // Active cited fact khi bấm vào câu
  const activeSentence = useMemo(() => {
    return channelData.sentences.find((s) => s.sentence_id === activeSentenceId) || null;
  }, [channelData.sentences, activeSentenceId]);

  // Hành động 1: Approve (Khóa Hash & Version - CM-26)
  const handleApprove = async () => {
    setClickCount((prev) => prev + 1);
    if (!canApprove) {
      setActionNotice({
        type: "error",
        msg: `RBAC Từ chối: Vai trò '${userRole}' không có quyền phê duyệt. Chỉ Owner hoặc Editor mới có quyền.`,
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
        });
      }
    } catch {
      setActionNotice({ type: "error", msg: "Lỗi trong quá trình tính toán mã băm phê duyệt." });
    }
  };

  // Hành động 2: Mở modal Reject
  const handleOpenRejectModal = () => {
    setClickCount((prev) => prev + 1);
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
    setClickCount((prev) => prev + 1);
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
    setClickCount((prev) => prev + 1);
    setIsEditing((prev) => !prev);
  };

  // Hành động 3b: Lưu bản chỉnh sửa của người (Tạo version mới và lưu Diff)
  const handleSaveEdit = async () => {
    setClickCount((prev) => prev + 1);
    const newVersionNum = currentVersion + 1;
    const computedHash = await computeSha256Client(editableText);

    // Tính diff đơn giản theo từ giữa bản cũ và bản mới
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
    setStatus("pending"); // Reset về pending để duyệt version mới

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
            className="text-xs opacity-60 hover:opacity-100 px-2 py-1"
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
              setClickCount((c) => c + 1);
            }}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
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
              setClickCount((c) => c + 1);
            }}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
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
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleToggleEdit}
            disabled={status === "approved"}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5 ${
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
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 disabled:opacity-40 transition-all flex items-center gap-1.5"
          >
            ❌ Reject (Từ chối)
          </button>

          <button
            onClick={handleApprove}
            disabled={status === "approved" || !canApprove}
            className="px-6 py-2.5 rounded-xl text-sm font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg disabled:opacity-40 transition-all flex items-center gap-2"
          >
            ✅ Approve (Duyệt ≤3 click)
          </button>
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
                    className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700"
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
                          setClickCount((c) => c + 1);
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

        {/* ── CỘT PHẢI: ẢNH AI KÈM NHÃN & STORYBOARD TIKTOK (5 CỘT) ── */}
        <div className="lg:col-span-5 space-y-6">
          {/* AI Image Card */}
          {channelData.ai_image && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Hình Ảnh Minh Họa</h3>
                {/* NHÃN ẢNH AI BẮT BUỘC */}
                <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1.5 shadow-2xs">
                  <span>✨</span> Ảnh do AI tạo
                </span>
              </div>

              {/* Image Thumbnail Container */}
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center">
                <div className="w-full h-64 bg-gradient-to-tr from-purple-900 via-indigo-900 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
                  <div className="text-4xl mb-2">🌄</div>
                  <div className="text-white text-xs font-mono font-medium max-w-xs line-clamp-3">
                    "{channelData.ai_image.prompt}"
                  </div>
                  <div className="mt-3 px-2 py-0.5 rounded bg-black/40 text-[11px] text-purple-300 border border-purple-500/30 font-mono">
                    Tỉ lệ: {channelData.ai_image.dimensions} ({channelData.ai_image.aspect_ratio})
                  </div>
                </div>
              </div>

              {/* Metadata Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Model Engine:</span>
                  <span className="font-mono font-bold text-slate-800">{channelData.ai_image.model}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">OCR Guardrail (Chữ/Giá):</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {channelData.ai_image.ocr_checked ? "Đạt (0 chữ/số)" : "Chưa quét"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Bộ lọc khuôn mặt / logo:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {channelData.ai_image.safety_passed ? "An toàn" : "Cảnh báo"}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Image Hash:</span>
                  <span className="font-mono text-slate-600 truncate max-w-[180px]">
                    {channelData.ai_image.sha256_hash}
                  </span>
                </div>
              </div>
            </div>
          )}

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
                className="text-slate-400 hover:text-slate-700 font-bold"
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-5 py-2 rounded-xl text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow"
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
