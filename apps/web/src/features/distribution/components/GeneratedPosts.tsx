"use client";

import React, { useState } from "react";
import { latestApproval } from "@/features/artifacts/adapters";
import type { Approval, ContentArtifact, PublishingJob } from "@/lib/apiTypes";
import { formatDateTime } from "@/lib/format";

export type SitePost = { id: string; title: string; slug: string; published_at: string; artifact_id: string | null };

type Props = {
  artifacts: ContentArtifact[];
  approvals: Approval[];
  jobs: PublishingJob[];
  sitePosts: SitePost[];
  facebook: { connected: boolean; reason: string | null };
  websiteAutoPublish: boolean;
};

const MAX_POSTS = 8;
const FACEBOOK_REASONS: Record<string, string> = {
  FACEBOOK_PAGE_PERMISSION_MISSING: "Meta đang chặn hoặc token Page thiếu quyền đăng bài",
  INTEGRATION_NOT_CONNECTED: "chưa kết nối Facebook Page",
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
  if (job?.status === "published") return { label: `Đã đăng Facebook${job.external_post_id ? ` · ${job.external_post_id}` : ""}`, tone: "bg-emerald-50 text-emerald-800" };
  if (job?.status === "failed") return { label: `Đăng Facebook lỗi: ${job.error_message ?? "không rõ"}. Bản nháp vẫn dùng được để đăng tay.`, tone: "bg-rose-50 text-rose-800" };
  if (job) return { label: "Đang chờ đăng Facebook", tone: "bg-blue-50 text-blue-800" };
  return props.facebook.connected
    ? { label: "Chưa đăng Facebook", tone: "bg-slate-100 text-slate-700" }
    : { label: `Chưa đăng: ${FACEBOOK_REASONS[props.facebook.reason ?? ""] ?? "Facebook chưa kết nối được"}. Đây là bản nháp để xem và đăng tay.`, tone: "bg-amber-50 text-amber-900" };
}

function PostCard({ artifact, props }: { artifact: ContentArtifact; props: Props }) {
  const [copied, setCopied] = useState(false);
  const result = obj(artifact.payload.result);
  const isArticle = artifact.role === "seo";
  const body = isArticle ? text(result.body_markdown) : text(obj(result.facebook).text) || text(result.caption);
  const copyText = isArticle ? [text(result.title), "", body].join("\n") : body;
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
            {approval === "approved" ? "Đã duyệt" : approval === "rejected" ? "Bị từ chối" : "Chờ duyệt"}
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
    </li>
  );
}

/** Articles and Facebook posts the agents produced, readable even when no channel could publish them. */
export default function GeneratedPosts(props: Props) {
  const posts = props.artifacts
    .filter((a) => (a.operation === "seo.local_draft" || a.operation === "content.repurpose") && obj(a.payload.result).synthetic !== true)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_POSTS);
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <h2 className="text-sm font-bold text-slate-900">Bài viết đã tạo</h2>
      <p className="mb-4 mt-0.5 text-[11px] text-slate-500">
        Bài website và bài Facebook mới nhất do agent tạo, kể cả khi chưa đăng được lên kênh nào. Mỗi bài ghi rõ đã đăng hay chưa và lý do.
      </p>
      {posts.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Chưa có bài nào. Bài sẽ xuất hiện sau khi SEO và Content chạy xong.</p>
      ) : (
        <ul className="space-y-4">{posts.map((a) => <PostCard key={a.id} artifact={a} props={props} />)}</ul>
      )}
    </section>
  );
}
