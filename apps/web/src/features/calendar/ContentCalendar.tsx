"use client";

import React, { useMemo, useState } from "react";
import { CHANNEL_LABEL, formatDateTimeVn, merchantApi, type CalendarEntry } from "@/lib/merchantApi";
import { EmptyState, LoadingBlock, Notice, useAction, useLoader } from "@/features/merchant/ui";

const STATUS: Record<
  CalendarEntry["status"],
  { label: string; badgeClass: string }
> = {
  draft: { label: "Chờ duyệt", badgeClass: "bg-amber-100 text-amber-800" },
  approved: { label: "Đã duyệt — Chờ giờ đăng", badgeClass: "bg-blue-100 text-blue-800" },
  publishing: { label: "Đang đăng", badgeClass: "bg-sky-100 text-sky-800" },
  published: { label: "Đã đăng", badgeClass: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Lỗi đăng", badgeClass: "bg-rose-100 text-rose-800" },
  rejected: { label: "Đã bỏ", badgeClass: "bg-slate-100 text-slate-600" },
};

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_FULL = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function vnDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function formatDayShort(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${dateIso.slice(8)}/${dateIso.slice(5, 7)}`;
}

function formatDayFull(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return `${WEEKDAY_FULL[d.getUTCDay()]} (${dateIso.slice(8)}/${dateIso.slice(5, 7)}/${dateIso.slice(0, 4)})`;
}

function EntryCard({
  entry,
  workspaceId,
  onChanged,
  selected,
  onToggle,
}: {
  entry: CalendarEntry;
  workspaceId: string;
  onChanged: () => Promise<void>;
  selected: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState(entry.caption);
  const { busy, notice, run } = useAction();
  const s = STATUS[entry.status] ?? STATUS.draft;
  const editable = !["publishing", "published"].includes(entry.status);
  const postUrl = typeof entry.metadata.post_url === "string" ? entry.metadata.post_url : null;
  const dayIso = vnDay(entry.scheduled_at);
  const timeStr = new Date(entry.scheduled_at).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-3 transition-colors hover:border-blue-400">
      <div className="space-y-2.5">
        {/* Hàng nhãn đầu thẻ: Ngày giờ + Kênh + Trạng thái (không bao giờ tràn khung) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
            {editable && entry.status !== "approved" && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                className="w-3.5 h-3.5 accent-blue-700 rounded"
                aria-label="Chọn để duyệt"
              />
            )}
            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-semibold">
              {formatDayShort(dayIso)} · {timeStr}
            </span>
          </label>
          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${s.badgeClass}`}>
            {s.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-semibold border border-blue-200">
            Kênh: {CHANNEL_LABEL[entry.channel] ?? entry.channel}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
            {entry.asset_ids.length} ảnh thật
          </span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
            {entry.generated_by === "template" || entry.generated_by === "asset_caption"
              ? "Caption từ ảnh"
              : `AI: ${entry.generated_by}`}
          </span>
        </div>

        {entry.theme && (
          <p className="text-xs font-semibold text-blue-800 bg-blue-50/60 border border-blue-100 rounded-md px-2.5 py-1">
            Chủ đề: {entry.theme}
          </p>
        )}

        {editing ? (
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Nội dung bài"
          />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <p
              className={`text-xs text-slate-800 leading-relaxed whitespace-pre-wrap break-words ${
                expanded ? "" : "line-clamp-4"
              }`}
            >
              {entry.caption}
            </p>
            {entry.caption.length > 180 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                {expanded ? "Thu gọn nội dung" : "Xem toàn bộ nội dung"}
              </button>
            )}
          </div>
        )}

        {entry.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.hashtags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-slate-100 text-blue-700 text-[11px] font-medium break-all"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {entry.error_message && (
          <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1.5 break-words">
            {entry.error_message}
          </p>
        )}

        <Notice notice={notice} />
      </div>

      {/* Cụm nút hành động dưới chân thẻ */}
      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        {editable ? (
          editing ? (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <button
                type="button"
                disabled={busy === "save"}
                onClick={() =>
                  run("save", async () => {
                    await merchantApi.updateCalendarEntry(workspaceId, entry.id, { caption });
                    setEditing(false);
                    await onChanged();
                  })
                }
                className="flex-1 py-1.5 px-3 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                {busy === "save" ? "Đang lưu..." : "Lưu nội dung"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              {entry.status !== "approved" && (
                <button
                  type="button"
                  disabled={busy === "approve"}
                  onClick={() =>
                    run("approve", async () => {
                      await merchantApi.reviewCalendar(workspaceId, [entry.id], "approve");
                      await onChanged();
                    })
                  }
                  className="flex-1 py-1.5 px-3 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 cursor-pointer text-center"
                >
                  {busy === "approve" ? "Đang duyệt..." : "Duyệt bài"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Sửa
              </button>
              {entry.status !== "rejected" && (
                <button
                  type="button"
                  disabled={busy === "reject"}
                  onClick={() =>
                    run("reject", async () => {
                      await merchantApi.reviewCalendar(workspaceId, [entry.id], "reject");
                      await onChanged();
                    })
                  }
                  className="py-1.5 px-3 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                >
                  {busy === "reject" ? "Đang bỏ..." : "Bỏ"}
                </button>
              )}
            </div>
          )
        ) : postUrl ? (
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full py-1.5 px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 text-center"
          >
            Xem bài đã đăng
          </a>
        ) : (
          <span className="text-xs text-slate-400">Đã khóa chỉnh sửa</span>
        )}
      </div>
    </li>
  );
}

/** Agent 3 (lập lịch tuần đa kênh, khung giờ vàng) + Agent 4 (đăng đúng giờ các bài đã duyệt). */
export function ContentCalendar({ workspaceId }: { workspaceId: string }) {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, error, loading, reload } = useLoader(
    () => merchantApi.calendar(workspaceId, week),
    [workspaceId, week]
  );
  const { busy, notice, setNotice, run } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved" | "published">("all");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  const days = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(data.week_start, i);
      return {
        date,
        shortLabel: formatDayShort(date),
        fullLabel: formatDayFull(date),
        entries: data.entries.filter((e) => vnDay(e.scheduled_at) === date),
      };
    });
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <Notice notice={{ kind: "error", text: error }} />;
  if (!data) return null;

  const drafts = data.entries.filter((e) => e.status === "draft");
  const approvedEntries = data.entries.filter((e) => e.status === "approved" || e.status === "publishing");
  const publishedEntries = data.entries.filter((e) => e.status === "published");
  const missing = Object.entries(data.channels.reasons);

  const filteredEntries = data.entries
    .filter((e) => {
      if (selectedDateFilter !== "all" && vnDay(e.scheduled_at) !== selectedDateFilter) return false;
      if (statusFilter === "draft" && e.status !== "draft") return false;
      if (statusFilter === "approved" && e.status !== "approved" && e.status !== "publishing") return false;
      if (statusFilter === "published" && e.status !== "published") return false;
      return true;
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pagedEntries = filteredEntries.slice(startIdx, startIdx + pageSize);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header chuẩn Template Điều khiển tự động / Agent Maps (không icon) */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="font-bold text-slate-900 text-base">
              Agent 3 &amp; 4: Lịch đăng đa kênh tuần {data.week_start.split("-").reverse().join("/")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Tổng lịch tuần: {data.entries.length} bài · Đã đăng: {publishedEntries.length} bài · Đã duyệt chờ giờ đăng: {approvedEntries.length} bài · Chờ duyệt: {drafts.length} bài
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Khung giờ vàng: 10:30–12:00 trưa và 17:00–19:30 tối. Chỉ bài đã duyệt mới được đăng; lỗi tạm thời được thử lại tự động (5 → 15 → 45 → 120 phút).
            </p>
          </div>
          <span className="self-start rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Tự động 24/7 đã bật
          </span>
        </div>

        {/* Hộp điều khiển tuần & lập lịch tự động nền xanh nhạt */}
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">
                Điều phối lịch nội dung tuần &amp; Phê duyệt hàng loạt
              </h2>
              {missing.length > 0 && (
                <p className="text-xs text-slate-600 mt-0.5">
                  Kênh chờ bổ sung cấu hình: {missing.map(([c, r]) => `${CHANNEL_LABEL[c] ?? c} (${r})`).join(" · ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setWeek(addDays(data.week_start, -7));
                  setSelectedDateFilter("all");
                  setPage(1);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ← Tuần trước
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeek(undefined);
                  setSelectedDateFilter("all");
                  setPage(1);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Tuần hiện tại
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeek(addDays(data.week_start, 7));
                  setSelectedDateFilter("all");
                  setPage(1);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Tuần sau →
              </button>
              <button
                type="button"
                disabled={busy === "generate"}
                onClick={() =>
                  run("generate", async () => {
                    const r = await merchantApi.generateCalendar(workspaceId, data.week_start);
                    await reload();
                    return r.created
                      ? `Agent 3 đã lập ${r.created} bài (${
                          r.generated_by === "template"
                            ? "dùng caption từ ảnh vì AI chưa khả dụng"
                            : `AI: ${r.generated_by}`
                        }).`
                      : "Tuần này không còn khung giờ trống (hoặc đã qua).";
                  })
                }
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                {busy === "generate" ? "Đang lập lịch tuần..." : "Lập lịch tuần tự động"}
              </button>
              {drafts.length > 0 && (
                <button
                  type="button"
                  disabled={busy === "approve-all"}
                  onClick={() =>
                    run("approve-all", async () => {
                      const ids = selected.size ? [...selected] : drafts.map((d) => d.id);
                      await merchantApi.reviewCalendar(workspaceId, ids, "approve");
                      setSelected(new Set());
                      await reload();
                      return `Đã duyệt ${ids.length} bài.`;
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  {busy === "approve-all"
                    ? "Đang duyệt..."
                    : selected.size
                      ? `Duyệt ${selected.size} bài đã chọn`
                      : `Duyệt tất cả (${drafts.length} bài)`}
                </button>
              )}
            </div>
          </div>

          <Notice notice={notice} onClose={() => setNotice(null)} />

          {/* Thanh chọn nhanh 7 ngày trong tuần gọn gàng, không làm hẹp thẻ bài viết */}
          <div className="pt-2 border-t border-blue-200/70">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedDateFilter("all");
                  setPage(1);
                }}
                className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  selectedDateFilter === "all"
                    ? "bg-blue-700 border-blue-700 text-white"
                    : "bg-white border-slate-200 text-slate-800 hover:border-blue-300"
                }`}
              >
                <div className="text-[11px] font-bold">Cả tuần</div>
                <div className={`text-xs font-semibold mt-0.5 ${selectedDateFilter === "all" ? "text-blue-100" : "text-slate-500"}`}>
                  {data.entries.length} bài đăng
                </div>
              </button>
              {days.map((d) => {
                const isSelected = selectedDateFilter === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setSelectedDateFilter(d.date);
                      setPage(1);
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-700 border-blue-700 text-white"
                        : d.entries.length > 0
                          ? "bg-white border-slate-200 text-slate-800 hover:border-blue-300"
                          : "bg-slate-50/70 border-slate-200 text-slate-400 hover:bg-white"
                    }`}
                  >
                    <div className="text-[11px] font-bold">{d.shortLabel}</div>
                    <div
                      className={`text-xs font-semibold mt-0.5 ${
                        isSelected
                          ? "text-blue-100"
                          : d.entries.length > 0
                            ? "text-blue-700"
                            : "text-slate-400"
                      }`}
                    >
                      {d.entries.length > 0 ? `${d.entries.length} bài` : "Trống"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Thanh lọc trạng thái & Chọn số bài mỗi trang */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Trạng thái:</span>
          {[
            { id: "all" as const, label: `Tất cả (${data.entries.length})` },
            { id: "draft" as const, label: `Chờ duyệt (${drafts.length})` },
            { id: "approved" as const, label: `Đã duyệt / Hẹn giờ (${approvedEntries.length})` },
            { id: "published" as const, label: `Đã đăng (${publishedEntries.length})` },
          ].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setStatusFilter(st.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === st.id
                  ? "bg-blue-700 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {st.label}
            </button>
          ))}
          {selectedDateFilter !== "all" && (
            <button
              type="button"
              onClick={() => {
                setSelectedDateFilter("all");
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Xóa lọc ngày ({formatDayShort(selectedDateFilter)})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Số bài mỗi trang"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
          >
            <option value={3}>3 bài / trang</option>
            <option value={6}>6 bài / trang</option>
            <option value={9}>9 bài / trang</option>
            <option value={12}>12 bài / trang</option>
          </select>
        </div>
      </div>

      {/* Danh sách bài viết dạng Lưới 3 cột + Phân trang */}
      <div className="p-6 space-y-4">
        {data.entries.length === 0 ? (
          <EmptyState>
            Tuần này chưa có bài. Bấm “Lập lịch tuần tự động” để Agent 3 xếp bài từ tư liệu ảnh thật trong thư viện Drive.
          </EmptyState>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500 space-y-2">
            <p>Không có bài đăng nào trong ngày hoặc trạng thái đang chọn.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedDateFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-700 text-white font-semibold cursor-pointer"
            >
              Xem toàn bộ {data.entries.length} bài trong tuần
            </button>
          </div>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-600">
                Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + pageSize, filteredEntries.length)}</strong> / {filteredEntries.length} bài (Trang <strong>{currentPage}/{totalPages}</strong>)
              </span>
              {totalPages > 1 && (
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
              )}
            </div>

            <ul className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedEntries.map((e) => (
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
            </ul>
          </section>
        )}

        <p className="text-[11px] text-slate-400">
          Đồng bộ lúc {formatDateTimeVn(new Date().toISOString())}
        </p>
      </div>
    </div>
  );
}
