"use client";

import React, { useState } from "react";
import { formatDateTimeVn, merchantApi, type CalendarChannel, type DriveAsset, type GMapsItem } from "@/lib/merchantApi";
import { Button, Card, EmptyState, LoadingBlock, Notice, Pill, Stat, useAction, useLoader } from "@/features/merchant/ui";
import { GoogleDriveConnect } from "./GoogleDriveConnect";

const REVIEW_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }> = {
  replied: { label: "Đã trả lời", tone: "green" },
  needs_approval: { label: "Chờ duyệt", tone: "amber" },
  pending: { label: "Đang soạn", tone: "blue" },
  failed: { label: "Lỗi đăng", tone: "red" },
  draft: { label: "Bản nháp", tone: "slate" },
  published: { label: "Đã đăng", tone: "green" },
};
const ASSET_STATUS: Record<DriveAsset["status"], { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }> = {
  pending_analysis: { label: "Đang phân tích", tone: "blue" },
  staged: { label: "Sẵn sàng", tone: "green" },
  rejected: { label: "Không dùng", tone: "red" },
  scheduled: { label: "Đã lên lịch", tone: "amber" },
  published: { label: "Đã đăng", tone: "slate" },
  archived: { label: "Logo/ lưu trữ", tone: "slate" },
};

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="text-amber-500 text-xs" aria-label={`${rating} sao`}>
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewRow({ item, workspaceId, onDone }: { item: GMapsItem; workspaceId: string; onDone: () => Promise<void> }) {
  const [text, setText] = useState(item.draft_reply ?? "");
  const { busy, notice, run } = useAction();
  const s = REVIEW_STATUS[item.status] ?? REVIEW_STATUS.pending;
  const sentiment = typeof item.metadata.sentiment === "string" ? item.metadata.sentiment : null;
  return (
    <li className="py-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{item.author_name}</p>
        <Stars rating={item.rating} />
        <Pill tone={s.tone}>{s.label}</Pill>
        {sentiment === "crisis" && <Pill tone="red">Nguy cơ phốt</Pill>}
        <span className="text-[11px] text-slate-400">{formatDateTimeVn(item.review_created_at ?? item.created_at)}</span>
      </div>
      <p className="text-sm text-slate-700">{item.content || <em className="text-slate-400">(chỉ chấm sao)</em>}</p>
      {item.reply_text && (
        <div className="rounded-lg bg-slate-50 border-l-4 border-emerald-400 px-3 py-2 text-sm text-slate-700">
          <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
            Quán trả lời {item.reply_source === "auto" ? "(AI tự động)" : item.reply_source === "google_existing" ? "(có sẵn trên Google)" : "(chủ quán duyệt)"} · {formatDateTimeVn(item.replied_at)}
          </p>
          {item.reply_text}
        </div>
      )}
      {(item.status === "needs_approval" || item.status === "failed") && (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Nội dung trả lời" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {item.error_message && <p className="text-xs text-rose-700">{item.error_message}</p>}
          <Notice notice={notice} />
          <Button
            busy={busy === "reply"}
            disabled={text.trim().length < 2}
            onClick={() =>
              run("reply", async () => {
                await merchantApi.gmapsReply(workspaceId, item.id, text.trim() === (item.draft_reply ?? "").trim() ? undefined : text.trim());
                await onDone();
              })
            }
          >
            Duyệt & đăng lên Google
          </Button>
        </div>
      )}
    </li>
  );
}

/** Agent 5 (Google Maps) + Agent 2 (thư viện ảnh thật từ Drive). Mọi số liệu lấy từ Google Business Profile thật. */
export function GoogleMapsHub({ workspaceId }: { workspaceId: string }) {
  const maps = useLoader(() => merchantApi.gmaps(workspaceId), [workspaceId]);
  const drive = useLoader(() => merchantApi.driveAssets(workspaceId), [workspaceId]);
  const { busy, notice, setNotice, run } = useAction();
  // Deep links (/gmaps?tab=drive_assets) and the return from Google's consent screen open the Drive tab.
  const [tab, setTab] = useState<"reviews" | "posts" | "library">(() => {
    if (typeof window === "undefined") return "reviews";
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("tab");
    if (wanted === "drive_assets" || wanted === "library" || params.has("google") || params.has("google_error")) return "library";
    return wanted === "posts" ? "posts" : "reviews";
  });
  const [postText, setPostText] = useState("");

  const overview = maps.data?.overview;
  const reviews = (maps.data?.items ?? []).filter((i) => i.item_type === "review");
  const posts = (maps.data?.items ?? []).filter((i) => i.item_type === "local_post");
  const awaiting = reviews.filter((r) => r.status === "needs_approval" || r.status === "failed");

  const schedule = (asset: DriveAsset, channels: CalendarChannel[]) =>
    run(`sched-${asset.id}`, async () => {
      const entries = await merchantApi.scheduleAsset(workspaceId, asset.id, channels);
      await drive.reload();
      return entries.length ? `Đã xếp vào lịch: ${entries.map((e) => formatDateTimeVn(e.scheduled_at)).join(", ")} (chờ duyệt ở mục Lịch đăng).` : "Không còn khung giờ trống trong 3 tuần tới.";
    });

  return (
    <div className="space-y-5">
      {overview && !overview.connection.connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-900">
          <span><b>Google Maps:</b> {overview.connection.reason ?? "Chưa kết nối tài khoản Google Business Profile"}</span>
          {tab !== "library" && (
            <button
              type="button"
              onClick={() => setTab("library")}
              className="rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-700"
            >
              Mở cấu hình kết nối Google
            </button>
          )}
        </div>
      )}
      {overview?.connection.connected && overview.connection.reason && <Notice notice={{ kind: "ok", text: overview.connection.reason }} />}

      {tab !== "reviews" && reviews.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
          <span>
            Hiện có <b>{reviews.length} đánh giá của khách</b>
            {reviews.length > 0 && ` (${reviews.slice(0, 2).map((r) => r.author_name).filter(Boolean).join(", ")}${reviews.length > 2 ? "…" : ""})`}
            {awaiting.length > 0 ? `, ${awaiting.length} câu trả lời chờ duyệt.` : "."}
          </span>
          <button
            type="button"
            onClick={() => setTab("reviews")}
            className="font-bold text-blue-700 underline hover:text-blue-900"
          >
            Xem danh sách Review ({reviews.length})
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => setTab("reviews")} className="block w-full text-left transition-transform hover:scale-[1.02]">
          <Stat label="Điểm trên Google" value={overview?.average_rating !== null && overview?.average_rating !== undefined ? `${overview.average_rating}★` : "—"} hint={overview?.total_reviews_on_google ? `${overview.total_reviews_on_google} review` : "chưa đồng bộ"} />
        </button>
        <button type="button" onClick={() => setTab("reviews")} className="block w-full text-left transition-transform hover:scale-[1.02]">
          <Stat label="Tỉ lệ đã trả lời" value={overview?.response_rate_percent !== null && overview?.response_rate_percent !== undefined ? `${overview.response_rate_percent}%` : "—"} hint={`${overview?.replied_reviews ?? 0}/${overview?.synced_reviews ?? 0} review đã đồng bộ`} />
        </button>
        <Stat label="Thời gian trả lời" value={overview?.median_reply_minutes !== null && overview?.median_reply_minutes !== undefined ? `${overview.median_reply_minutes} phút` : "—"} hint="trung vị, mục tiêu < 5 phút" />
        <button type="button" onClick={() => setTab("reviews")} className="block w-full text-left transition-transform hover:scale-[1.02]">
          <Stat label="Chờ chủ quán duyệt" value={overview?.awaiting_approval ?? 0} hint={overview?.last_synced_at ? `đồng bộ ${formatDateTimeVn(overview.last_synced_at)}` : undefined} />
        </button>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap gap-2.5" role="tablist">
        {(
          [
            ["reviews", `Đánh giá khách hàng (${reviews.length})`],
            ["posts", `Bài đăng Local Post (${posts.length})`],
            ["library", `Thư viện ảnh Drive (${drive.data?.assets.length ?? 0})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${tab === id ? "bg-blue-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "reviews" && (
        <Card
          title="Review Google Maps"
          subtitle="Review 4–5★ tích cực được AI trả lời ngay (có từ khóa địa phương). Review thấp sao/ tiêu cực được soạn nháp, báo Telegram và chờ anh/chị duyệt."
          actions={
            <Button busy={busy === "sync"} onClick={() => run("sync", async () => {
              const r = await merchantApi.gmapsSync(workspaceId);
              await maps.reload();
              return r.status === "ok" ? `Đồng bộ xong: ${r.new_reviews} review mới, tự trả lời ${r.auto_replied}, chờ duyệt ${r.awaiting_approval}.` : `Chưa đồng bộ được: ${r.detail}`;
            })}>
              Đồng bộ ngay
            </Button>
          }
        >
          {maps.loading && !maps.data && <LoadingBlock />}
          {maps.error && <Notice notice={{ kind: "error", text: maps.error }} />}
          {maps.data && reviews.length === 0 && <EmptyState>Chưa có review nào được đồng bộ.</EmptyState>}
          {awaiting.length > 0 && <p className="text-xs font-semibold text-amber-800 mb-1">{awaiting.length} review đang chờ duyệt — xem bên dưới.</p>}
          <ul className="divide-y divide-slate-100">
            {[...awaiting, ...reviews.filter((r) => !awaiting.includes(r))].map((item) => (
              <ReviewRow key={item.id} item={item} workspaceId={workspaceId} onDone={maps.reload} />
            ))}
          </ul>
        </Card>
      )}

      {tab === "posts" && (
        <Card title="Google Maps Local Post" subtitle="Bài đăng ngắn trên hồ sơ Maps giúp tăng thứ hạng tìm kiếm địa phương. Agent 3 tự xếp 2 bài/tuần; bạn có thể viết thêm.">
          <div className="space-y-2 mb-4">
            <textarea value={postText} onChange={(e) => setPostText(e.target.value)} rows={3} placeholder="Nội dung bài (10–1500 ký tự)…" aria-label="Nội dung Local Post" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" busy={busy === "draft"} disabled={postText.trim().length < 10} onClick={() => run("draft", async () => {
                await merchantApi.gmapsDraftPost(workspaceId, { content: postText.trim() });
                setPostText("");
                await maps.reload();
                return "Đã lưu bản nháp.";
              })}>
                Lưu nháp
              </Button>
              <Button busy={busy === "publish-new"} disabled={postText.trim().length < 10} onClick={() => run("publish-new", async () => {
                await merchantApi.gmapsDraftPost(workspaceId, { content: postText.trim(), publish_now: true });
                setPostText("");
                await maps.reload();
                return "Đã đăng lên Google Maps.";
              })}>
                Đăng ngay
              </Button>
              <Button variant="secondary" busy={busy === "menu"} onClick={() => run("menu", async () => {
                const r = await merchantApi.gmapsSyncMenu(workspaceId);
                return `Đã cập nhật thực đơn lên Maps (${r.items} món, ${r.sections} nhóm).`;
              })}>
                Cập nhật thực đơn lên Maps
              </Button>
            </div>
          </div>
          {posts.length === 0 && <EmptyState>Chưa có Local Post.</EmptyState>}
          <ul className="divide-y divide-slate-100">
            {posts.map((p) => (
              <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex gap-2 items-center mb-1">
                    <Pill tone={(REVIEW_STATUS[p.status] ?? REVIEW_STATUS.draft).tone}>{(REVIEW_STATUS[p.status] ?? REVIEW_STATUS.draft).label}</Pill>
                    <span className="text-[11px] text-slate-400">{formatDateTimeVn(p.replied_at ?? p.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{p.content}</p>
                  {p.error_message && <p className="text-xs text-rose-700 mt-1">{p.error_message}</p>}
                </div>
                {(p.status === "draft" || p.status === "failed") && (
                  <Button busy={busy === `pub-${p.id}`} onClick={() => run(`pub-${p.id}`, async () => {
                    await merchantApi.gmapsPublishPost(workspaceId, p.id);
                    await maps.reload();
                    return "Đã đăng lên Google Maps.";
                  })}>
                    Duyệt & đăng
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "library" && (
        <Card
          title="Thư viện ảnh thật (Agent 2)"
          subtitle="Ảnh chủ quán bỏ vào thư mục Drive được quét mỗi 20 phút, AI nhận diện món và viết caption. Ảnh mờ/ tối bị loại; ảnh tên “logo…” dùng làm watermark."
          actions={
            <Button busy={busy === "scan"} onClick={() => run("scan", async () => {
              const r = await merchantApi.driveScan(workspaceId);
              await drive.reload();
              return r.status === "ok" ? `Đã quét ${r.listed} ảnh: mới ${r.new_files}, phân tích xong ${r.analyzed}, loại ${r.rejected}, lỗi ${r.failed}${Number(r.remaining) ? `, còn ${r.remaining} ảnh chờ lượt sau` : ""}.` : `Chưa quét được: ${r.detail}`;
            })}>
              Quét Drive ngay
            </Button>
          }
        >
          <GoogleDriveConnect workspaceId={workspaceId} connection={drive.data?.connection} onChanged={async () => { await drive.reload(); await maps.reload(); }} />
          {drive.data && !drive.data.connection.connected && <div className="mt-3"><Notice notice={{ kind: "error", text: drive.data.connection.reason ?? "Drive chưa kết nối" }} /></div>}
          {drive.loading && !drive.data && <LoadingBlock />}
          {drive.data && drive.data.assets.length === 0 && <div className="mt-3" />}
          {drive.data && drive.data.assets.length === 0 && <EmptyState>Chưa có ảnh nào. Hãy chụp món bằng điện thoại và bỏ vào thư mục Drive đã kết nối.</EmptyState>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drive.data?.assets.map((a) => {
              const s = ASSET_STATUS[a.status];
              return (
                <li key={a.id} className="rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate" title={a.file_name}>
                      {a.dish_name ?? a.file_name}
                    </p>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </div>
                  {a.generated_caption && <p className="text-xs text-slate-700">{a.generated_caption}</p>}
                  {a.flavor_notes && <p className="text-[11px] text-slate-500">{a.flavor_notes}</p>}
                  {a.error_message && <p className="text-[11px] text-rose-700">{a.error_message}</p>}
                  {a.vision_tags.length > 0 && <p className="text-[11px] text-slate-400">{a.vision_tags.map((t) => `#${t}`).join(" ")}</p>}
                  <div className="flex flex-wrap gap-2 mt-auto pt-1">
                    <a href={a.file_url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-blue-700">
                      Mở ảnh
                    </a>
                    {a.status === "staged" && (
                      <>
                        <Button variant="secondary" busy={busy === `sched-${a.id}`} onClick={() => schedule(a, ["facebook"])}>
                          Lên lịch Facebook
                        </Button>
                        <Button variant="secondary" busy={busy === `post-${a.id}`} onClick={() => run(`post-${a.id}`, async () => {
                          await merchantApi.gmapsDraftPost(workspaceId, { asset_id: a.id });
                          await maps.reload();
                          setTab("posts");
                          return "AI đã viết bản nháp Local Post từ ảnh này.";
                        })}>
                          Viết Local Post
                        </Button>
                        <Button variant="secondary" busy={busy === `photo-${a.id}`} onClick={() => run(`photo-${a.id}`, async () => {
                          await merchantApi.gmapsPhoto(workspaceId, a.id);
                          return "Đã thêm ảnh vào hồ sơ Google Maps.";
                        })}>
                          Thêm vào ảnh Maps
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
