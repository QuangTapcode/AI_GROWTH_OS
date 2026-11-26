"use client";

import React, { useState } from "react";
import { latestApproval } from "@/features/artifacts/adapters";
import GeneratedImagePreview from "@/features/review-queue/components/GeneratedImagePreview";
import type { Approval, ContentArtifact, PublishingJob } from "@/lib/apiTypes";
import { formatDateTime } from "@/lib/format";

export type SitePost = { id: string; title: string; slug: string; published_at: string; artifact_id: string | null };

type Props = {
  artifacts: ContentArtifact[];
  approvals: Approval[];
  jobs: PublishingJob[];
  sitePosts: SitePost[];
  facebook: { connected: boolean; reason: string | null };
  facebookGroup?: { connected: boolean; reason: string | null };
  websiteAutoPublish: boolean;
};

const PAGE_SIZE = 8;
const FACEBOOK_REASONS: Record<string, string> = {
  FACEBOOK_PAGE_PERMISSION_MISSING: "Meta đang chặn hoặc token Page thiếu quyền đăng bài",
  FACEBOOK_GROUP_SESSION_MISSING: "chưa đăng nhập Group Bot (.fb-session.json)",
  INTEGRATION_NOT_CONNECTED: "chưa kết nối kênh Facebook",
};

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

const SOURCE_LINE = /^\[source:[^\]]+\]\((https?:\/\/[^)\s]+)\)$/;
const CONTACT_LINE = /^\[Request information\]\(\/contact\)\s*[—-]\s*(.+)$/;

function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-700">
      {source
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => {
          const cited = line.trim().match(SOURCE_LINE);
          if (cited) {
            const url = new URL(cited[1]);
            return (
              <p key={index} className="text-xs text-slate-500">
                Nguồn:{" "}
                <a href={cited[1]} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                  {url.hostname}
                  {url.pathname}
                </a>
              </p>
            );
          }
          const contact = line.trim().match(CONTACT_LINE);
          if (contact)
            return (
              <p key={index} className="font-semibold text-blue-800">
                Lời kêu gọi: {contact[1]}
              </p>
            );
          const heading = line.match(/^#{1,6}\s+(.*)/);
          if (heading)
            return (
              <p key={index} className="pt-2 font-bold text-slate-900">
                {heading[1]}
              </p>
            );
          const item = line.match(/^\s*[-*]\s+(.*)/);
          if (item)
            return (
              <p key={index} className="pl-4">
                • {item[1]}
              </p>
            );
          return <p key={index}>{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>;
        })}
    </div>
  );
}

function publishState(artifact: ContentArtifact, props: Props): { label: string; tone: string; isPublished: boolean } {
  if (artifact.role === "seo") {
    const post = props.sitePosts.find((p) => p.artifact_id === artifact.id);
    if (post)
      return {
        label: `Đã đăng lên website · /posts/${post.slug}`,
        tone: "bg-emerald-100 text-emerald-800",
        isPublished: true,
      };
    return props.websiteAutoPublish
      ? { label: "Chưa đăng lên website", tone: "bg-amber-100 text-amber-800", isPublished: false }
      : {
          label: 'Chưa đăng: ô "Tự đăng bài SEO lên website" đang tắt.',
          tone: "bg-amber-100 text-amber-800",
          isPublished: false,
        };
  }
  const job = props.jobs
    .filter((j) => j.artifact_id === artifact.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const targetLabel =
    job?.platform_name === "facebook_group"
      ? "Facebook Group"
      : job?.platform_name === "tiktok"
        ? "TikTok"
        : "Facebook";
  if (job?.status === "published")
    return {
      label: `Đã đăng ${targetLabel}${job.external_post_id ? ` · ${job.external_post_id}` : ""}`,
      tone: "bg-emerald-100 text-emerald-800",
      isPublished: true,
    };
  if (job?.status === "failed")
    return {
      label: `Đăng ${targetLabel} lỗi: ${job.error_message ?? "không rõ"}`,
      tone: "bg-rose-100 text-rose-800",
      isPublished: false,
    };
  if (job)
    return {
      label: `Đang hẹn tự động đăng ${targetLabel}`,
      tone: "bg-blue-100 text-blue-800",
      isPublished: false,
    };
  if (props.facebookGroup?.connected) {
    return { label: "Chưa đăng Facebook Group", tone: "bg-amber-100 text-amber-800", isPublished: false };
  }
  return props.facebook.connected
    ? { label: "Chưa đăng Facebook", tone: "bg-amber-100 text-amber-800", isPublished: false }
    : {
        label: `Chưa đăng: ${
          FACEBOOK_REASONS[props.facebookGroup?.reason ?? props.facebook.reason ?? ""] ??
          "Facebook Group / Page chưa kết nối"
        }`,
        tone: "bg-amber-100 text-amber-800",
        isPublished: false,
      };
}

function TikTokScript({ script }: { script: Record<string, unknown> }) {
  if (!text(script.hook)) return null;
  const scenes = Array.isArray(script.scenes) ? script.scenes.map(obj) : [];
  return (
    <details className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
      <summary className="cursor-pointer font-semibold text-slate-900">
        Xem kịch bản video TikTok ({String(script.word_count ?? 0)} từ)
      </summary>
      <p className="mt-2 font-semibold">{text(script.hook)}</p>
      <ol className="mt-2 space-y-1.5">
        {scenes.map((scene, index) => (
          <li key={index}>
            <p>{text(scene.voiceover)}</p>
            <p className="text-[11px] text-slate-500">Hình ảnh: {text(scene.visual)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 font-semibold text-blue-800">Lời kêu gọi: {text(script.cta)}</p>
    </details>
  );
}

function PostCard({ artifact, props }: { artifact: ContentArtifact; props: Props }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const result = obj(artifact.payload.result);
  const isArticle = artifact.role === "seo";
  const body = isArticle ? text(result.body_markdown) : text(obj(result.facebook).text) || text(result.caption);
  const title = text(result.title) || artifact.title || (isArticle ? "Bài viết Website (SEO)" : "Bài đăng Facebook");
  const copyText = isArticle ? [title, "", body].join("\n") : body;
  const firstImageAsset = Array.isArray(result.image_assets) ? obj(result.image_assets[0]) : {};
  const previewImageUrl = text(obj(result.generated_image).url) || text(firstImageAsset.url);
  const previewImage = text(obj(result.generated_image).url)
    ? obj(result.generated_image)
    : text(firstImageAsset.url)
      ? {
          url: text(firstImageAsset.url),
          alt_text: text(firstImageAsset.attribution) || text(result.alt_text) || "Ảnh minh họa bài đăng Cộng đồng",
          synthetic: firstImageAsset.synthetic === true,
        }
      : {};
  const approval = latestApproval(artifact.id, props.approvals)?.status;
  const state = publishState(artifact, props);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-blue-400 flex flex-col">
      {previewImageUrl && (
        <div className="relative h-40 bg-slate-100 border-b border-slate-100">
          <img src={previewImageUrl} alt={title} className="w-full h-full object-cover" />
          <div className="absolute top-2 left-2">
            <span className="rounded-md bg-white/95 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
              {isArticle ? "Bài Website (SEO)" : "Bài Facebook"}
            </span>
          </div>
          <div className="absolute top-2 right-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${state.tone}`}>
              {state.isPublished ? "Đã đăng" : "Chưa đăng"}
            </span>
          </div>
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={`rounded-md px-2 py-0.5 font-semibold ${state.tone}`}>{state.label}</span>
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ${
                approval === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {approval === "approved"
                ? "Đã duyệt"
                : approval === "rejected"
                  ? "Từ chối"
                  : approval === "revoked"
                    ? "Hết hạn duyệt"
                    : "Chờ duyệt"}
            </span>
            <span className="text-slate-500">· {formatDateTime(artifact.created_at)}</span>
          </div>

          <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">{title}</h3>

          <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-line">
            {body.replace(/^#+\s*/gm, "") || "(Chưa có nội dung)"}
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer text-center"
            >
              {expanded ? "Thu gọn" : "Xem chi tiết"}
            </button>
            <button
              type="button"
              onClick={copy}
              disabled={!copyText.trim()}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer text-center"
            >
              {copied ? "Đã sao chép" : "Sao chép bài"}
            </button>
          </div>

          {expanded && (
            <div className="mt-2 pt-2 border-t border-slate-200 space-y-3">
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {isArticle ? (
                  <>
                    <h4 className="text-xs font-bold text-slate-900">{title}</h4>
                    {text(result.meta_description) && (
                      <p className="mt-1 text-[11px] italic text-slate-500">{text(result.meta_description)}</p>
                    )}
                    <div className="mt-2">
                      <Markdown source={body} />
                    </div>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{body}</p>
                )}
              </div>
              {!isArticle && <TikTokScript script={obj(result.tiktok)} />}
              {!isArticle && <GeneratedImagePreview image={previewImage} />}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function isArtifactPublished(artifact: ContentArtifact, props: Props): boolean {
  if (artifact.role === "seo") {
    return props.sitePosts.some((p) => p.artifact_id === artifact.id);
  }
  return props.jobs.some((j) => j.artifact_id === artifact.id && j.status === "published");
}

function getArtifactDateIsoVn(artifact: ContentArtifact, props: Props): string {
  const pubJob = props.jobs
    .filter((j) => j.artifact_id === artifact.id && j.status === "published" && j.published_at)
    .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""))[0];
  const sitePost = artifact.role === "seo" ? props.sitePosts.find((p) => p.artifact_id === artifact.id) : undefined;
  const raw = pubJob?.published_at || sitePost?.published_at || artifact.created_at;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const vn = new Date(parsed.getTime() + 7 * 3600_000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(vn.getUTCDate()).padStart(2, "0")}`;
}

export default function GeneratedPosts(props: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const allPosts = props.artifacts
    .filter(
      (a) =>
        (a.operation === "seo.local_draft" ||
          a.operation === "content.repurpose" ||
          a.operation === "content.generate") &&
        obj(a.payload.result).synthetic !== true
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const publishedTotal = allPosts.filter((a) => isArtifactPublished(a, props)).length;
  const unpublishedTotal = allPosts.length - publishedTotal;

  const filteredPosts = allPosts.filter((a) => {
    const pub = isArtifactPublished(a, props);
    if (statusFilter === "published" && !pub) return false;
    if (statusFilter === "unpublished" && pub) return false;
    if (dateFilter && getArtifactDateIsoVn(a, props) !== dateFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const posts = filteredPosts.slice(startIdx, startIdx + pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Kho bài viết Website &amp; Facebook do Agent khởi tạo ({allPosts.length} bài)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Hiển thị dạng lưới 3 cột gọn gàng kèm phân trang. Bấm &ldquo;Xem chi tiết&rdquo; trên từng thẻ để đọc toàn bộ bài viết.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              statusFilter === "all"
                ? "bg-blue-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Tất cả ({allPosts.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("published");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              statusFilter === "published"
                ? "bg-blue-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Đã đăng ({publishedTotal})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("unpublished");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              statusFilter === "unpublished"
                ? "bg-blue-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Chưa đăng / Hẹn giờ ({unpublishedTotal})
          </button>
          <input
            type="date"
            aria-label="Lọc bài viết theo ngày tháng năm"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => {
                setDateFilter("");
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Xóa ngày
            </button>
          )}
          <select
            aria-label="Số bài mỗi trang"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value={6}>6 bài / trang</option>
            <option value={9}>9 bài / trang</option>
            <option value={12}>12 bài / trang</option>
          </select>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Không có bài viết nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">
              Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + pageSize, filteredPosts.length)}</strong> / {filteredPosts.length} bài (Trang {currentPage}/{totalPages})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                    pNum === currentPage
                      ? "bg-blue-700 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {pNum}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
              >
                Sau
              </button>
            </div>
          </div>

          <ul className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((a) => (
              <PostCard key={a.id} artifact={a} props={props} />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">
                Đang xem trang <strong>{currentPage} / {totalPages}</strong> (Bài {startIdx + 1}–{Math.min(startIdx + pageSize, filteredPosts.length)} trong tổng số {filteredPosts.length} bài)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  « Đầu
                </button>
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  ‹ Trang trước
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`w-7 h-7 rounded-lg font-bold transition-colors ${
                      pNum === currentPage
                        ? "bg-blue-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pNum}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  Trang sau ›
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                >
                  Cuối »
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
