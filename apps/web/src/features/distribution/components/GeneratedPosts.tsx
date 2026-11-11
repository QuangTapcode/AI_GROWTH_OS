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

const PAGE_SIZE = 10;
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

/** Minimal Markdown preview: headings, bullet lines and paragraphs; the stored article is unchanged. */
function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {source.split("\n").filter((line) => line.trim()).map((line, index) => {
        // Citation and CTA lines are assembled by code; show them as the website does, not as raw Markdown.
        const cited = line.trim().match(SOURCE_LINE);
        if (cited) {
          const url = new URL(cited[1]);
          return <p key={index} className="text-xs text-slate-500">Nguồn: <a href={cited[1]} target="_blank" rel="noopener noreferrer"
            className="text-blue-700 underline">{url.hostname}{url.pathname}</a></p>;
        }
        const contact = line.trim().match(CONTACT_LINE);
        if (contact) return <p key={index} className="font-semibold text-blue-800">Lời kêu gọi: {contact[1]}</p>;
        const heading = line.match(/^#{1,6}\s+(.*)/);
        if (heading) return <p key={index} className="pt-2 font-bold text-slate-900">{heading[1]}</p>;
        const item = line.match(/^\s*[-*]\s+(.*)/);
        if (item) return <p key={index} className="pl-4">• {item[1]}</p>;
        return <p key={index}>{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>;
      })}
    </div>
  );
}

function publishState(artifact: ContentArtifact, props: Props): { label: string; tone: string } {
  if (artifact.role === "seo") {
    const post = props.sitePosts.find((p) => p.artifact_id === artifact.id);
    if (post) return { label: `Đã đăng lên website · /posts/${post.slug}`, tone: "bg-emerald-50 text-emerald-800" };
    return props.websiteAutoPublish
      ? { label: "Chưa đăng lên website", tone: "bg-slate-100 text-slate-700" }
      : { label: "Chưa đăng: ô \"Tự đăng bài SEO lên website\" đang tắt. Đây là bản nháp để xem.", tone: "bg-amber-50 text-amber-900" };
  }
  const job = props.jobs.filter((j) => j.artifact_id === artifact.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const targetLabel =
    job?.platform_name === "facebook_group"
      ? "Facebook Group"
      : job?.platform_name === "tiktok"
        ? "TikTok"
        : "Facebook";
  if (job?.status === "published") return { label: `Đã đăng ${targetLabel}${job.external_post_id ? ` · ${job.external_post_id}` : ""}`, tone: "bg-emerald-50 text-emerald-800" };
  if (job?.status === "failed") return { label: `Đăng ${targetLabel} lỗi: ${job.error_message ?? "không rõ"}. Bản nháp vẫn dùng được để đăng tay.`, tone: "bg-rose-50 text-rose-800" };
  if (job) return { label: `Đang chờ đăng ${targetLabel}`, tone: "bg-blue-50 text-blue-800" };
  if (props.facebookGroup?.connected) {
    return { label: "Chưa đăng Facebook Group", tone: "bg-slate-100 text-slate-700" };
  }
  return props.facebook.connected
    ? { label: "Chưa đăng Facebook", tone: "bg-slate-100 text-slate-700" }
    : { label: `Chưa đăng: ${FACEBOOK_REASONS[props.facebookGroup?.reason ?? props.facebook.reason ?? ""] ?? "Facebook Group / Page chưa kết nối được"}. Đây là bản nháp để xem và đăng tay.`, tone: "bg-amber-50 text-amber-900" };
}

function TikTokScript({ script }: { script: Record<string, unknown> }) {
  if (!text(script.hook)) return null;
  const scenes = Array.isArray(script.scenes) ? script.scenes.map(obj) : [];
  return (
    <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm text-slate-800">
      <summary className="cursor-pointer text-xs font-bold text-slate-900">
        Kịch bản TikTok · {String(script.word_count ?? 0)} từ{script.within_length === false ? " (ngoài khoảng 120–180 từ)" : ""}
      </summary>
      <p className="mt-2 font-semibold">{text(script.hook)}</p>
      <ol className="mt-2 space-y-2">
        {scenes.map((scene, index) => (
          <li key={index}>
            <p>{text(scene.voiceover)}</p>
            <p className="text-xs text-slate-500">Hình ảnh: {text(scene.visual)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 font-semibold text-blue-800">Lời kêu gọi: {text(script.cta)}</p>
    </details>
  );
}

function ImageSuggestion({ suggestion }: { suggestion: Record<string, unknown> }) {
  const prompt = text(suggestion.prompt), reason = text(suggestion.reason);
  if (!prompt && !reason) return null;
  return (
    <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs text-slate-700">
      <summary className="cursor-pointer font-bold text-slate-900">Chưa có ảnh đã duyệt: gợi ý ảnh</summary>
      {reason ? <p className="mt-2">{reason}</p> : <p className="mt-2">Tỉ lệ {text(suggestion.aspect_ratio)}. Mô tả để tạo ảnh: {prompt}</p>}
    </details>
  );
}

function PostCard({ artifact, props }: { artifact: ContentArtifact; props: Props }) {
  const [copied, setCopied] = useState(false);
  const result = obj(artifact.payload.result);
  const isArticle = artifact.role === "seo";
  const body = isArticle ? text(result.body_markdown) : text(obj(result.facebook).text) || text(result.caption);
  const copyText = isArticle ? [text(result.title), "", body].join("\n") : body;
  const firstImageAsset = Array.isArray(result.image_assets) ? obj(result.image_assets[0]) : {};
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
    <li className="rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-800">{isArticle ? "Bài website (SEO)" : "Bài Facebook"}</span>
          <span className="text-slate-500">{formatDateTime(artifact.created_at)}</span>
          <span className={`rounded-md px-2 py-0.5 font-semibold ${approval === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {approval === "approved" ? "Đã duyệt" : approval === "rejected" ? "Bị từ chối" : approval === "revoked" ? "Hết hạn duyệt" : "Chờ duyệt"}
          </span>
        </div>
        <button type="button" onClick={copy} disabled={!copyText.trim()}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          {copied ? "Đã sao chép" : isArticle ? "Sao chép bài viết" : "Sao chép bài Facebook"}
        </button>
      </div>
      <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${state.tone}`}>{state.label}</p>
      <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-100 bg-slate-50/50 p-4">
        {isArticle ? (
          <>
            <h3 className="text-base font-bold text-slate-900">{text(result.title) || "(Chưa có tiêu đề)"}</h3>
            {text(result.meta_description) && <p className="mt-1 text-xs italic text-slate-500">{text(result.meta_description)}</p>}
            <div className="mt-3"><Markdown source={body} /></div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs font-bold text-slate-900">TripC · bản xem trước</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{body || "(Chưa có nội dung)"}</p>
          </>
        )}
      </div>
      {!isArticle && <TikTokScript script={obj(result.tiktok)} />}
      {!isArticle && <GeneratedImagePreview image={previewImage} />}
      {!isArticle && !text(previewImage.url) && <ImageSuggestion suggestion={obj(result.image_suggestion)} />}
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

/** Articles and Facebook posts the agents produced, readable even when no channel could publish them. */
export default function GeneratedPosts(props: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const allPosts = props.artifacts
    .filter(
      (a) =>
        (a.operation === "seo.local_draft" ||
          a.operation === "content.repurpose" ||
          a.operation === "content.generate") &&
        obj(a.payload.result).synthetic !== true,
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

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const posts = filteredPosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Bài viết đã tạo &amp; đã đăng ({allPosts.length} bài)
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Hiển thị đầy đủ bài website và bài Facebook (không ẩn bài đã đăng). Lọc theo trạng thái hoặc Ngày / Tháng / Năm cụ thể.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPage(1);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              statusFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              statusFilter === "published"
                ? "bg-emerald-700 text-white"
                : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            ✓ Đã đăng ({publishedTotal})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("unpublished");
              setPage(1);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              statusFilter === "unpublished"
                ? "bg-blue-700 text-white"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            ⏰ Chưa đăng / Hẹn ({unpublishedTotal})
          </button>
          <input
            type="date"
            aria-label="Lọc bài viết theo ngày tháng năm"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => {
                setDateFilter("");
                setPage(1);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
            >
              Xóa ngày
            </button>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Không có bài viết nào khớp với bộ lọc hiện tại.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-4">
            {posts.map((a) => (
              <PostCard key={a.id} artifact={a} props={props} />
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>
                Trang <b>{currentPage}</b> / <b>{totalPages}</b> ({filteredPosts.length} bài)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold disabled:opacity-40"
                >
                  ‹ Trước
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold disabled:opacity-40"
                >
                  Sau ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
