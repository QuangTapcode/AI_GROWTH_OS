"use client";

import React, { useMemo, useState } from "react";
import { CHANNEL_LABEL, formatDateTimeVn, merchantApi, type CalendarEntry } from "@/lib/merchantApi";
import { Button, Card, EmptyState, LoadingBlock, Notice, Pill, useAction, useLoader } from "@/features/merchant/ui";

const STATUS: Record<CalendarEntry["status"], { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }> = {
  draft: { label: "Chờ duyệt", tone: "amber" },
  approved: { label: "Đã duyệt — chờ giờ đăng", tone: "blue" },
  publishing: { label: "Đang đăng", tone: "blue" },
  published: { label: "Đã đăng", tone: "green" },
  failed: { label: "Lỗi", tone: "red" },
  rejected: { label: "Đã bỏ", tone: "slate" },
};
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function vnDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function EntryCard({ entry, workspaceId, onChanged, selected, onToggle }: { entry: CalendarEntry; workspaceId: string; onChanged: () => Promise<void>; selected: boolean; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(entry.caption);
  const { busy, notice, run } = useAction();
  const s = STATUS[entry.status];
  const editable = !["publishing", "published"].includes(entry.status);
  const postUrl = typeof entry.metadata.post_url === "string" ? entry.metadata.post_url : null;
  return (
    <li className="rounded-xl border border-slate-200 p-3 space-y-2 bg-white">
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          {editable && entry.status !== "approved" && <input type="checkbox" checked={selected} onChange={onToggle} className="accent-blue-700" aria-label="Chọn để duyệt" />}
          {new Date(entry.scheduled_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })} · {CHANNEL_LABEL[entry.channel]}
        </label>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      {entry.theme && <p className="text-[11px] font-semibold text-indigo-700">{entry.theme}</p>}
      {editing ? (
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" aria-label="Nội dung bài" />
      ) : (
        <p className="text-xs text-slate-700 whitespace-pre-wrap line-clamp-6">{entry.caption}</p>
      )}
      {entry.hashtags.length > 0 && <p className="text-[11px] text-blue-700">{entry.hashtags.join(" ")}</p>}
      <p className="text-[11px] text-slate-400">
        {entry.asset_ids.length} ảnh thật · {entry.generated_by === "template" ? "caption từ ảnh" : entry.generated_by === "asset_caption" ? "caption từ ảnh" : `AI: ${entry.generated_by}`}
      </p>
      {entry.error_message && <p className="text-[11px] text-rose-700">{entry.error_message}</p>}
      {postUrl && (
        <a href={postUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-blue-700">
          Xem bài đã đăng
        </a>
      )}
      <Notice notice={notice} />
      {editable && (
        <div className="flex flex-wrap gap-1.5">
          {editing ? (
            <>
              <Button busy={busy === "save"} onClick={() => run("save", async () => {
                await merchantApi.updateCalendarEntry(workspaceId, entry.id, { caption });
                setEditing(false);
                await onChanged();
              })}>
                Lưu (chờ duyệt lại)
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Hủy
              </Button>
            </>
          ) : (
            <>
              {entry.status !== "approved" && (
                <Button busy={busy === "approve"} onClick={() => run("approve", async () => {
                  await merchantApi.reviewCalendar(workspaceId, [entry.id], "approve");
                  await onChanged();
                })}>
                  Duyệt
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Sửa
              </Button>
              {entry.status !== "rejected" && (
                <Button variant="danger" busy={busy === "reject"} onClick={() => run("reject", async () => {
                  await merchantApi.reviewCalendar(workspaceId, [entry.id], "reject");
                  await onChanged();
                })}>
                  Bỏ
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Agent 3 (lập lịch tuần đa kênh, khung giờ vàng) + Agent 4 (đăng đúng giờ các bài đã duyệt). */
export function ContentCalendar({ workspaceId }: { workspaceId: string }) {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, error, loading, reload } = useLoader(() => merchantApi.calendar(workspaceId, week), [workspaceId, week]);
  const { busy, notice, setNotice, run } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const days = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(data.week_start, i);
      return { date, entries: data.entries.filter((e) => vnDay(e.scheduled_at) === date) };
    });
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <Notice notice={{ kind: "error", text: error }} />;
  if (!data) return null;
  const drafts = data.entries.filter((e) => e.status === "draft");
  const missing = Object.entries(data.channels.reasons);

  return (
    <div className="space-y-5">
      <Card
        title={`Lịch đăng tuần ${data.week_start.split("-").reverse().join("/")}`}
        subtitle="Khung giờ vàng: 10:30–12:00 trưa và 17:00–19:30 tối. Chỉ bài đã duyệt mới được đăng; lỗi tạm thời được thử lại tự động (5 → 15 → 45 → 120 phút)."
        actions={
          <>
            <Button variant="secondary" onClick={() => setWeek(addDays(data.week_start, -7))}>
              ← Tuần trước
            </Button>
            <Button variant="secondary" onClick={() => setWeek(addDays(data.week_start, 7))}>
              Tuần sau →
            </Button>
            <Button busy={busy === "generate"} onClick={() => run("generate", async () => {
              const r = await merchantApi.generateCalendar(workspaceId, data.week_start);
              await reload();
              return r.created ? `Agent 3 đã lập ${r.created} bài (${r.generated_by === "template" ? "dùng caption từ ảnh vì AI chưa khả dụng" : `AI: ${r.generated_by}`}).` : "Tuần này không còn khung giờ trống (hoặc đã qua).";
            })}>
              Lập lịch tuần
            </Button>
          </>
        }
      >
        <Notice notice={notice} onClose={() => setNotice(null)} />
        {missing.length > 0 && (
          <p className="text-[11px] text-slate-500 mt-2">
            Kênh chưa dùng được: {missing.map(([c, r]) => `${CHANNEL_LABEL[c]} (${r})`).join(" · ")}
          </p>
        )}
        {drafts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-slate-600">{drafts.length} bài chờ duyệt</span>
            <Button busy={busy === "approve-all"} onClick={() => run("approve-all", async () => {
              const ids = selected.size ? [...selected] : drafts.map((d) => d.id);
              await merchantApi.reviewCalendar(workspaceId, ids, "approve");
              setSelected(new Set());
              await reload();
              return `Đã duyệt ${ids.length} bài.`;
            })}>
              {selected.size ? `Duyệt ${selected.size} bài đã chọn` : "Duyệt tất cả"}
            </Button>
          </div>
        )}
      </Card>
      {data.entries.length === 0 ? (
        <EmptyState>Tuần này chưa có bài. Bấm “Lập lịch tuần” để Agent 3 xếp bài từ ảnh món thật trong thư viện Drive.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((d) => (
            <div key={d.date} className="space-y-2 min-w-0">
              <p className="text-xs font-bold text-slate-700">
                {WEEKDAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()]} {d.date.slice(8)}/{d.date.slice(5, 7)}
              </p>
              <ul className="space-y-2">
                {d.entries.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    workspaceId={workspaceId}
                    onChanged={reload}
                    selected={selected.has(e.id)}
                    onToggle={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id);
                        else next.add(e.id);
                        return next;
                      })
                    }
                  />
                ))}
                {d.entries.length === 0 && <li className="text-[11px] text-slate-400">—</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">Cập nhật lúc {formatDateTimeVn(new Date().toISOString())}</p>
    </div>
  );
}
