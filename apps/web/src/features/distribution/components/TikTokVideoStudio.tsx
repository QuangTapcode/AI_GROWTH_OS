"use client";

import React, { useMemo, useRef, useState } from "react";
import { ApiError, growthApi } from "@/lib/api";
import type {
  ContentArtifact,
  TikTokConnectionSummary,
  TikTokPrivacyLevel,
  TikTokVideo,
} from "@/lib/apiTypes";
import { formatDateTime } from "@/lib/format";

type Props = {
  workspaceId: string;
  canEdit: boolean;
  connection: TikTokConnectionSummary;
  videos: TikTokVideo[];
  artifacts: ContentArtifact[];
  onToast: (message: string) => void;
  onReload: () => void;
};

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const inputBase =
  "tiktok-input w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none";

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractPrefillFromArtifact(artifact: ContentArtifact): {
  title: string;
  caption: string;
  hashtags: string;
} {
  const result = obj(artifact.payload?.result);
  const tiktok = obj(result.tiktok);
  const facebook = obj(result.facebook);
  const title = (typeof result.title === "string" && result.title.trim()) || artifact.title || "TripC TikTok Video";

  if (typeof tiktok.hook === "string" && tiktok.hook.trim()) {
    const scenes = Array.isArray(tiktok.scenes) ? tiktok.scenes.map(obj) : [];
    const firstVoice = typeof scenes[0]?.voiceover === "string" ? scenes[0].voiceover.trim() : "";
    const cta = typeof tiktok.cta === "string" ? tiktok.cta.trim() : "";
    const tags = Array.isArray(tiktok.hashtags)
      ? tiktok.hashtags.map((t) => (String(t).startsWith("#") ? String(t) : `#${String(t)}`))
      : ["#TripC", "#DaNang", "#VietnamTravel"];
    const caption = [tiktok.hook.trim(), firstVoice, cta].filter(Boolean).join("\n\n").slice(0, 2000);
    return { title: title.slice(0, 255), caption, hashtags: tags.join(" ") };
  }

  const fbText = typeof facebook.text === "string" ? facebook.text.trim() : "";
  const summary = typeof result.meta_description === "string" ? result.meta_description.trim() : "";
  const body = fbText || (summary ? `${title}\n\n${summary}` : title);
  return {
    title: title.slice(0, 255),
    caption: body.slice(0, 2000),
    hashtags: "#TripC #DaNang #VietnamTravel",
  };
}

function validateUrlField(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Lỗi: Vui lòng nhập URL video TikTok bắt đầu bằng https://.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Lỗi: URL video không đúng định dạng (ví dụ: https://cdn.example.com/video.mp4).";
  }
  if (parsed.protocol !== "https:") {
    return "Lỗi: URL video TikTok phải dùng giao thức https:// công khai.";
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local")
  ) {
    return "Lỗi: Không được dùng URL localhost hoặc IP nội bộ; hãy dùng URL https:// công khai.";
  }
  return null;
}

function validateFileField(file: File | null): string | null {
  if (!file) return "Lỗi: Vui lòng chọn file video .mp4 hoặc .mov từ máy tính.";
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".mp4") && !lowerName.endsWith(".mov")) {
    return "Lỗi: Chỉ hỗ trợ định dạng video .mp4 hoặc .mov.";
  }
  if (file.size <= 0) return "Lỗi: File video bị rỗng.";
  if (file.size > MAX_VIDEO_BYTES) {
    return "Lỗi: Dung lượng video vượt quá 100 MB. Hãy nén nhẹ hơn trước khi tải lên.";
  }
  return null;
}

const VIDEO_STATUS_BADGE: Record<string, string> = {
  ready: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  publishing: "bg-sky-50 text-sky-700 border-sky-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function TikTokVideoStudio({
  workspaceId,
  canEdit,
  connection,
  videos,
  artifacts,
  onToast,
  onReload,
}: Props) {
  const [sourceArtifactId, setSourceArtifactId] = useState("");
  const [videoSourceType, setVideoSourceType] = useState<"file_upload" | "url">("file_upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [hashtags, setHashtags] = useState("#TripC #DaNang #VietnamTravel");
  const [privacyLevel, setPrivacyLevel] = useState<TikTokPrivacyLevel>(
    connection.sandbox_privacy_default || "SELF_ONLY"
  );
  const [isAigc, setIsAigc] = useState(true);
  const [action, setAction] = useState<"publish_now" | "schedule" | "save_draft">("publish_now");
  const [scheduledFor, setScheduledFor] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 30 * 60 * 1000))
  );

  // Validation errors shown only after interaction (blur or submit)
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [authBusy, setAuthBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const scheduleRef = useRef<HTMLInputElement | null>(null);
  const connectBtnRef = useRef<HTMLButtonElement | null>(null);

  const prefillableArtifacts = useMemo(() => {
    return artifacts
      .filter((a) => {
        const res = obj(a.payload?.result);
        return (
          (a.operation === "seo.local_draft" ||
            a.operation === "content.repurpose" ||
            a.operation === "content.generate") &&
          res.synthetic !== true
        );
      })
      .slice(0, 30);
  }, [artifacts]);

  const applyArtifact = (artifactId: string, force = false) => {
    setSourceArtifactId(artifactId);
    if (!artifactId) return;
    const found = prefillableArtifacts.find((a) => a.id === artifactId);
    if (!found) return;
    if (!force && captionEdited && caption.trim()) return;
    const prefilled = extractPrefillFromArtifact(found);
    setTitle(prefilled.title);
    setCaption(prefilled.caption);
    setHashtags(prefilled.hashtags);
    setCaptionError(null);
    setCaptionEdited(false);
  };

  const handleConnectTikTok = async () => {
    setAuthBusy(true);
    setStatusMessage(null);
    try {
      const auth = await growthApi.getTikTokAuthUrl(workspaceId, "/distribution");
      window.location.assign(auth.url);
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.message} (${err.code})` : "Không thể mở trang đăng nhập TikTok.";
      setStatusMessage({ tone: "error", text: `Lỗi: ${msg}` });
      setAuthBusy(false);
    }
  };

  const handleDisconnectTikTok = async () => {
    setAuthBusy(true);
    setStatusMessage(null);
    try {
      await growthApi.disconnectTikTok(workspaceId);
      onToast("Đã ngắt kết nối tài khoản TikTok khỏi workspace.");
      setStatusMessage({ tone: "info", text: "Đã ngắt kết nối tài khoản TikTok." });
      onReload();
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.message} (${err.code})` : "Không thể ngắt kết nối TikTok.";
      setStatusMessage({ tone: "error", text: `Lỗi: ${msg}` });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (action !== "save_draft" && !connection.connected) {
      setStatusMessage({
        tone: "error",
        text: "Lỗi: Chưa kết nối tài khoản TikTok. Hãy bấm 'Kết nối TikTok' trước khi đăng ngay hoặc hẹn giờ.",
      });
      connectBtnRef.current?.focus();
      return;
    }

    const nextFileErr = videoSourceType === "file_upload" ? validateFileField(selectedFile) : null;
    const nextUrlErr = videoSourceType === "url" ? validateUrlField(mediaUrl) : null;
    const nextCaptionErr = caption.trim().length === 0 ? "Lỗi: Caption đăng TikTok không được để trống." : null;
    const nextScheduleErr =
      action === "schedule" && (!scheduledFor || Number.isNaN(new Date(scheduledFor).getTime()))
        ? "Lỗi: Vui lòng chọn ngày giờ hẹn đăng hợp lệ."
        : null;

    setTouched({ file: true, url: true, caption: true, schedule: true });
    setFileError(nextFileErr);
    setUrlError(nextUrlErr);
    setCaptionError(nextCaptionErr);
    setScheduleError(nextScheduleErr);

    if (nextFileErr) {
      fileInputRef.current?.focus();
      return;
    }
    if (nextUrlErr) {
      urlInputRef.current?.focus();
      return;
    }
    if (nextCaptionErr) {
      captionRef.current?.focus();
      return;
    }
    if (nextScheduleErr) {
      scheduleRef.current?.focus();
      return;
    }

    const formData = new FormData();
    formData.set("video_source_type", videoSourceType);
    if (videoSourceType === "file_upload" && selectedFile) {
      formData.set("video", selectedFile, selectedFile.name);
    } else {
      formData.set("media_url", mediaUrl.trim());
    }
    if (sourceArtifactId) formData.set("source_artifact_id", sourceArtifactId);
    if (title.trim()) formData.set("title", title.trim());
    formData.set("caption", caption.trim());
    formData.set("hashtags", hashtags.trim());
    formData.set("privacy_level", privacyLevel);
    formData.set("is_aigc", isAigc ? "true" : "false");
    formData.set("action", action);
    if (action === "schedule") {
      formData.set("scheduled_for", new Date(scheduledFor).toISOString());
    }

    setSubmitting(true);
    setUploadProgress(0);
    try {
      const res = await growthApi.uploadTikTokVideo(workspaceId, formData, (pct) => {
        setUploadProgress(pct);
      });
      const okMsg =
        action === "save_draft"
          ? `Đã lưu nháp video "${res.video.title}".`
          : action === "publish_now"
            ? `Đã gửi video "${res.video.title}" vào hàng đợi đăng TikTok ngay.`
            : `Đã lên lịch đăng video "${res.video.title}" lên TikTok.`;
      setStatusMessage({ tone: "success", text: okMsg });
      onToast(okMsg);
      setSelectedFile(null);
      setMediaUrl("");
      setTouched({});
      setFileError(null);
      setUrlError(null);
      setCaptionError(null);
      setScheduleError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onReload();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Lỗi: ${err.message} (${err.code})`
          : "Lỗi: Không thể tải video TikTok lên máy chủ.";
      setStatusMessage({ tone: "error", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="tiktok-studio"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5"
      aria-labelledby="tiktok-studio-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1 min-w-0 flex-[1_1_360px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
              TikTok Auto-Publish · Option B
            </span>
            <h2 id="tiktok-studio-heading" className="text-sm font-bold text-slate-900">
              Đăng &amp; Hẹn giờ Video TikTok (Upload .mp4 hoặc URL)
            </h2>
          </div>
          <p className="text-[11px] text-slate-500">
            Kết nối tài khoản TikTok Sandbox (Target user), chọn video có sẵn hoặc dán URL https://, tự điền caption/hashtag từ bài viết đã duyệt và phát trực tiếp qua TikTok Content Posting API v2.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {connection.connected ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
              ✓ Đã kết nối: {connection.display_name || connection.open_id || "TikTok Creator"}
            </span>
          ) : connection.expired ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-800">
              Token TikTok đã hết hạn
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
              Chưa kết nối TikTok
            </span>
          )}

          {canEdit && (
            <>
              <button
                ref={connectBtnRef}
                type="button"
                disabled={authBusy}
                onClick={() => void handleConnectTikTok()}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 cursor-pointer disabled:opacity-50"
              >
                {authBusy ? "Đang chuyển hướng…" : connection.connected ? "Đổi tài khoản TikTok" : "Kết nối TikTok"}
              </button>
              {(connection.connected || connection.expired) && (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleDisconnectTikTok()}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 cursor-pointer disabled:opacity-50"
                >
                  Ngắt kết nối
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-3.5 py-2.5 text-[11px] text-sky-900">
        <strong>Lưu ý TikTok Sandbox:</strong> Ứng dụng ở chế độ Sandbox mặc định đăng bài với quyền{" "}
        <code>SELF_ONLY</code> (chỉ mình tài khoản đăng thấy trên hồ sơ TikTok) và chỉ tài khoản đã thêm trong{" "}
        <strong>Target users</strong> trên TikTok Developer Portal mới ủy quyền OAuth thành công.
      </div>

      <form
        onSubmit={handleSubmit}
        method="POST"
        noValidate
        aria-labelledby="tiktok-studio-heading"
        className="space-y-4"
      >
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2">
          <label htmlFor="tiktok-source-artifact" className="block text-xs font-bold text-slate-700">
            Lấy caption &amp; hashtag gợi ý từ bài viết / kịch bản có sẵn (tùy chọn)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              id="tiktok-source-artifact"
              name="source_artifact_id"
              value={sourceArtifactId}
              onChange={(e) => applyArtifact(e.target.value, false)}
              className={`${inputBase} sm:flex-1`}
            >
              <option value="">-- Tự nhập caption thủ công --</option>
              {prefillableArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.operation})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!sourceArtifactId}
              onClick={() => applyArtifact(sourceArtifactId, true)}
              className="shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3.5 py-2 cursor-pointer disabled:opacity-40"
            >
              Áp dụng lại caption
            </button>
          </div>
        </div>

        <fieldset className="rounded-xl border border-slate-200/80 p-3.5 space-y-3">
          <legend className="px-1 text-xs font-bold text-slate-800">Nguồn video TikTok</legend>
          <div className="flex flex-col sm:flex-row gap-4 text-xs text-slate-800">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="tiktok-src-file"
                name="video_source_type"
                value="file_upload"
                checked={videoSourceType === "file_upload"}
                onChange={() => {
                  setVideoSourceType("file_upload");
                  setUrlError(null);
                }}
                className="h-4 w-4 accent-slate-900 cursor-pointer"
              />
              <label htmlFor="tiktok-src-file" className="font-semibold cursor-pointer">
                Tải file video từ máy (.mp4 / .mov, tối đa 100 MB)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="tiktok-src-url"
                name="video_source_type"
                value="url"
                checked={videoSourceType === "url"}
                onChange={() => {
                  setVideoSourceType("url");
                  setFileError(null);
                }}
                className="h-4 w-4 accent-slate-900 cursor-pointer"
              />
              <label htmlFor="tiktok-src-url" className="font-semibold cursor-pointer">
                Dán URL video công khai (https://)
              </label>
            </div>
          </div>

          {videoSourceType === "file_upload" ? (
            <div className="space-y-1">
              <label htmlFor="tiktok-video-file" className="block text-xs font-bold text-slate-700">
                Chọn file video <span aria-hidden="true" className="text-rose-600">*</span>
              </label>
              <span id="tiktok-video-file-hint" className="block text-[11px] text-slate-500">
                Định dạng MP4 hoặc MOV, dung lượng tối đa 100 MB (khuyến nghị &lt; 64 MB để tải lên 1 chunk nhanh nhất).
              </span>
              <input
                ref={fileInputRef}
                id="tiktok-video-file"
                name="video"
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                required
                aria-invalid={fileError ? "true" : "false"}
                aria-describedby={
                  fileError ? "tiktok-video-file-hint tiktok-video-file-error" : "tiktok-video-file-hint"
                }
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setTouched((prev) => ({ ...prev, file: true }));
                  setFileError(validateFileField(file));
                }}
                className={`${inputBase} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800`}
              />
              {selectedFile && !fileError && (
                <p className="text-[11px] font-medium text-emerald-700">
                  Đã chọn: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
              {fileError && (
                <p id="tiktok-video-file-error" className="text-xs font-medium text-rose-700">
                  <span role="img" aria-label="Lỗi">❌</span> {fileError.replace(/^Lỗi:\s*/, "")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label htmlFor="tiktok-video-url" className="block text-xs font-bold text-slate-700">
                URL video https:// công khai <span aria-hidden="true" className="text-rose-600">*</span>
              </label>
              <span id="tiktok-video-url-hint" className="block text-[11px] text-slate-500">
                Link trực tiếp tới file .mp4 trên CDN/S3/R2 có thể tải công khai qua HTTPS.
              </span>
              <input
                ref={urlInputRef}
                id="tiktok-video-url"
                name="media_url"
                type="url"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://cdn.example.com/videos/danang-tripc.mp4"
                value={mediaUrl}
                required
                aria-invalid={urlError ? "true" : "false"}
                aria-describedby={urlError ? "tiktok-video-url-hint tiktok-video-url-error" : "tiktok-video-url-hint"}
                onChange={(e) => {
                  const val = e.target.value;
                  setMediaUrl(val);
                  if (touched.url && urlError && !validateUrlField(val)) {
                    setUrlError(null);
                  }
                }}
                onBlur={() => {
                  if (mediaUrl.trim() || touched.url) {
                    setTouched((prev) => ({ ...prev, url: true }));
                    setUrlError(validateUrlField(mediaUrl));
                  }
                }}
                className={inputBase}
              />
              {urlError && (
                <p id="tiktok-video-url-error" className="text-xs font-medium text-rose-700">
                  <span role="img" aria-label="Lỗi">❌</span> {urlError.replace(/^Lỗi:\s*/, "")}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="tiktok-video-title" className="block text-xs font-bold text-slate-700">
              Tiêu đề quản lý nội bộ
            </label>
            <input
              id="tiktok-video-title"
              name="title"
              type="text"
              maxLength={255}
              placeholder="Ví dụ: Top 3 quán ăn đêm Đà Nẵng"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputBase}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tiktok-video-hashtags" className="block text-xs font-bold text-slate-700">
              Hashtags đính kèm cuối caption
            </label>
            <input
              id="tiktok-video-hashtags"
              name="hashtags"
              type="text"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className={inputBase}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="tiktok-video-caption" className="block text-xs font-bold text-slate-700">
            Caption hiển thị trên TikTok <span aria-hidden="true" className="text-rose-600">*</span>
          </label>
          <span id="tiktok-caption-hint" className="block text-[11px] text-slate-500">
            {caption.length}/2.200 ký tự · Các hashtag bên trên sẽ tự động nối vào cuối caption nếu chưa xuất hiện.
          </span>
          <textarea
            ref={captionRef}
            id="tiktok-video-caption"
            name="caption"
            rows={4}
            maxLength={2200}
            required
            value={caption}
            aria-invalid={captionError ? "true" : "false"}
            aria-describedby={captionError ? "tiktok-caption-hint tiktok-caption-error" : "tiktok-caption-hint"}
            onChange={(e) => {
              const val = e.target.value;
              setCaption(val);
              setCaptionEdited(true);
              if (captionError && val.trim().length > 0) {
                setCaptionError(null);
              }
            }}
            onBlur={() => {
              if (touched.caption || caption.length > 0) {
                setTouched((prev) => ({ ...prev, caption: true }));
                setCaptionError(caption.trim().length === 0 ? "Lỗi: Caption đăng TikTok không được để trống." : null);
              }
            }}
            className={inputBase}
            placeholder="Nhập mô tả hấp dẫn cho video TikTok..."
          />
          {captionError && (
            <p id="tiktok-caption-error" className="text-xs font-medium text-rose-700">
              <span role="img" aria-label="Lỗi">❌</span> {captionError.replace(/^Lỗi:\s*/, "")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="space-y-2">
            <label htmlFor="tiktok-privacy-level" className="block text-xs font-bold text-slate-700">
              Quyền riêng tư video
            </label>
            <select
              id="tiktok-privacy-level"
              name="privacy_level"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value as TikTokPrivacyLevel)}
              className={inputBase}
            >
              <option value="SELF_ONLY">Chỉ mình tôi (SELF_ONLY · Khuyên dùng cho Sandbox)</option>
              <option value="PUBLIC_TO_EVERYONE">Công khai (PUBLIC_TO_EVERYONE · Cần app đã duyệt)</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Bạn bè (MUTUAL_FOLLOW_FRIENDS)</option>
              <option value="FOLLOWER_OF_CREATOR">Người theo dõi (FOLLOWER_OF_CREATOR)</option>
            </select>
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="tiktok-is-aigc"
                name="is_aigc"
                checked={isAigc}
                onChange={(e) => setIsAigc(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-slate-900 cursor-pointer"
              />
              <label htmlFor="tiktok-is-aigc" className="text-xs text-slate-700 cursor-pointer">
                Gắn nhãn nội dung có hỗ trợ AI (<code>is_aigc: true</code> &amp; <code>#AIGC</code>)
              </label>
            </div>
          </div>

          <fieldset className="rounded-xl border border-slate-200/80 p-3 space-y-2">
            <legend className="px-1 text-xs font-bold text-slate-800">Chế độ phát hành</legend>
            <div className="space-y-1.5 text-xs text-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="tiktok-act-now"
                  name="action"
                  value="publish_now"
                  checked={action === "publish_now"}
                  onChange={() => {
                    setAction("publish_now");
                    setScheduleError(null);
                  }}
                  className="h-4 w-4 accent-slate-900 cursor-pointer"
                />
                <label htmlFor="tiktok-act-now" className="cursor-pointer font-semibold">
                  Đăng ngay lập tức (Worker tự đẩy ngay sau khi tải lên)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="tiktok-act-schedule"
                  name="action"
                  value="schedule"
                  checked={action === "schedule"}
                  onChange={() => setAction("schedule")}
                  className="h-4 w-4 accent-slate-900 cursor-pointer"
                />
                <label htmlFor="tiktok-act-schedule" className="cursor-pointer font-semibold">
                  Hẹn giờ đăng tự động
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="tiktok-act-draft"
                  name="action"
                  value="save_draft"
                  checked={action === "save_draft"}
                  onChange={() => {
                    setAction("save_draft");
                    setScheduleError(null);
                  }}
                  className="h-4 w-4 accent-slate-900 cursor-pointer"
                />
                <label htmlFor="tiktok-act-draft" className="cursor-pointer">
                  Chỉ lưu nháp video trong thư viện
                </label>
              </div>
            </div>

            {action === "schedule" && (
              <div className="pt-2 space-y-1">
                <label htmlFor="tiktok-scheduled-for" className="block text-xs font-bold text-slate-700">
                  Ngày &amp; giờ hẹn đăng <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  ref={scheduleRef}
                  id="tiktok-scheduled-for"
                  name="scheduled_for"
                  type="datetime-local"
                  value={scheduledFor}
                  required
                  aria-invalid={scheduleError ? "true" : "false"}
                  aria-describedby={scheduleError ? "tiktok-schedule-error" : undefined}
                  onChange={(e) => {
                    setScheduledFor(e.target.value);
                    if (scheduleError && e.target.value) setScheduleError(null);
                  }}
                  className={inputBase}
                />
                {scheduleError && (
                  <p id="tiktok-schedule-error" className="text-xs font-medium text-rose-700">
                    <span role="img" aria-label="Lỗi">❌</span> {scheduleError.replace(/^Lỗi:\s*/, "")}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        </div>

        {submitting && (
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <label id="tiktok-upload-progress-label" htmlFor="tiktok-upload-progress">
                {videoSourceType === "file_upload"
                  ? `Đang tải video lên máy chủ (${uploadProgress}%)…`
                  : "Đang gửi yêu cầu đăng video TikTok…"}
              </label>
              {videoSourceType === "file_upload" && <span>{uploadProgress}%</span>}
            </div>
            <progress
              id="tiktok-upload-progress"
              max={100}
              value={videoSourceType === "file_upload" ? uploadProgress : undefined}
              aria-labelledby="tiktok-upload-progress-label"
              className="tiktok-progress"
            />
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className={
            statusMessage
              ? `rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                  statusMessage.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : statusMessage.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                }`
              : "visually-hidden"
          }
        >
          {statusMessage?.text ?? ""}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-slate-500">
            Video sau khi gửi sẽ xuất hiện trong danh sách bên dưới và bảng <strong>Publishing schedule</strong>.
          </p>
          <button
            type="submit"
            disabled={submitting || !canEdit}
            title={canEdit ? "Tải video và tạo lệnh đăng TikTok" : "Quyền Viewer không thể đăng video"}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Đang xử lý…"
              : action === "publish_now"
                ? "Tải lên & Đăng TikTok ngay"
                : action === "schedule"
                  ? "Lên lịch đăng TikTok"
                  : "Lưu nháp video TikTok"}
          </button>
        </div>
      </form>

      <div className="border-t border-slate-100 pt-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Video TikTok gần đây ({videos.length})
          </h3>
          <button
            type="button"
            onClick={onReload}
            className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
          >
            Làm mới trạng thái
          </button>
        </div>

        {videos.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 text-xs text-slate-500">
            Chưa có video TikTok nào được tải lên hoặc hẹn giờ.
          </p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 flex flex-wrap items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 break-words">{v.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        VIDEO_STATUS_BADGE[v.status] ?? VIDEO_STATUS_BADGE.ready
                      }`}
                    >
                      {v.status}
                    </span>
                    <span className="text-[10px] rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono text-slate-600">
                      {v.privacy_level}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2 whitespace-pre-wrap">{v.caption}</p>
                  <p className="text-[11px] text-slate-500">
                    {v.video_source_type === "file_upload"
                      ? `File MP4${v.file_size_bytes ? ` · ${(v.file_size_bytes / (1024 * 1024)).toFixed(2)} MB` : ""}`
                      : `URL: ${v.media_url ?? "—"}`}
                    {v.job_scheduled_for ? ` · Lịch: ${formatDateTime(v.job_scheduled_for)}` : ""}
                    {v.tiktok_publish_id ? ` · publish_id: ${v.tiktok_publish_id}` : ""}
                  </p>
                  {(v.error_message || v.job_error_message) && (
                    <p className="text-[11px] font-medium text-rose-700 break-words">
                      Lỗi: {v.error_message || v.job_error_message}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

