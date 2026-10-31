"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

type Signal = { id: string; query: string; rank: number; title: string; url: string; domain: string; source_id: string | null; observed_at: string;
  previous_rank: number | null; is_new: boolean };

function Movement({ signal }: { signal: Signal }) {
  if (signal.is_new) return <span className="shrink-0 rounded bg-blue-50 px-1.5 text-xs font-semibold text-blue-800">mới</span>;
  if (signal.previous_rank == null || signal.previous_rank === signal.rank) return null;
  const up = signal.previous_rank > signal.rank;
  return <span className={`shrink-0 text-xs font-semibold ${up ? "text-emerald-700" : "text-red-700"}`} title={`Lần trước hạng ${signal.previous_rank}`}>{up ? "↑" : "↓"}{Math.abs(signal.previous_rank - signal.rank)}</span>;
}
type Source = { id: string; title: string; url_or_blob: string; status: string; version: number; license: string | null; retrieved_at: string | null;
  ingest_attempts: number; ingest_error: string | null; chunk_count: number };
type Discovery = { discovery_run_id: string | null; signals: Signal[]; sources: Source[] };

const STATUS: Record<string, { label: string; tone: string }> = {
  imported: { label: "Chờ tải", tone: "bg-slate-100 text-slate-700" },
  processing: { label: "Đang tải", tone: "bg-blue-50 text-blue-800" },
  needs_review: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-900" },
  approved: { label: "Đã duyệt", tone: "bg-emerald-50 text-emerald-800" },
  rejected: { label: "Từ chối", tone: "bg-red-50 text-red-800" },
  revoked: { label: "Thu hồi", tone: "bg-red-50 text-red-800" },
};

/** Search landscape (titles/URLs only) + open/official sources queued for ingest and owner review. */
export default function ResearchDiscoveryPanel({ workspaceId, canEdit, canApprove, onContextChanged }: { workspaceId: string; canEdit: boolean; canApprove: boolean; onContextChanged: () => void }) {
  const path = `/workspaces/${workspaceId}/research-discovery`;
  const { data, error, reload } = useApiData(`${workspaceId}:research-discovery`, (signal) => apiRequest<Discovery>(path, { signal }));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function act(key: string, run: () => Promise<string>) {
    setBusy(key); setNotice("");
    try { setNotice(await run()); reload(); }
    catch (err) { setNotice((err as Error).message || "Thao tác không thành công."); }
    finally { setBusy(null); }
  }

  const discover = () => act("discover", async () => {
    const result = await apiRequest<{ signal_count: number; queued_sources: unknown[] }>(path, { method: "POST" });
    return `Đã ghi ${result.signal_count} kết quả tìm kiếm và xếp ${result.queued_sources.length} nguồn mới vào hàng chờ tải.`;
  });
  const review = (source: Source, decision: "approved" | "rejected") => act(source.id, async () => {
    await apiRequest(`/workspaces/${workspaceId}/sources/${source.id}/review`, { method: "POST", body: { decision, expected_version: source.version } });
    if (decision === "rejected") return `Đã từ chối "${source.title}".`;
    // Research reads a pinned snapshot; issue a new one so the approved source is used by the next run.
    await apiRequest(`/workspaces/${workspaceId}/knowledge-contexts`, { method: "POST" });
    onContextChanged();
    return `Đã duyệt "${source.title}" và tạo knowledge context mới cho Research.`;
  });

  const queries = [...new Set((data?.signals ?? []).map((s) => s.query))];
  return <section className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="research-discovery">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900">Nguồn &amp; xu hướng</h2>
        <p className="mt-1 text-sm text-slate-500">Tìm kiếm tối đa 3 truy vấn từ hồ sơ doanh nghiệp. Kết quả chỉ lưu tiêu đề và đường dẫn; chỉ nguồn mở hoặc chính thống mới được tải nội dung và phải được duyệt trước khi Research dùng.</p></div>
      <div className="flex gap-2"><button onClick={reload} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Làm mới</button>
        <button onClick={discover} disabled={!canEdit || busy !== null} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "discover" ? "Đang tìm…" : "Tìm nguồn & xu hướng"}</button></div>
    </div>
    {notice && <p role="status" className="mt-3 text-sm text-blue-800">{notice}</p>}
    {error && <p className="mt-3 text-sm text-red-700">Không tải được dữ liệu xu hướng.</p>}
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Nguồn tải nội dung</h3>
        {data?.sources.length ? <ul className="mt-3 space-y-2">{data.sources.map((s) => {
          const status = STATUS[s.status] ?? { label: s.status, tone: "bg-slate-100 text-slate-700" };
          return <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2"><a href={s.url_or_blob} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{s.title}</a>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span></div>
            <p className="mt-1 text-xs text-slate-500">{s.license ?? "Chưa có giấy phép"} · {s.chunk_count} đoạn{s.retrieved_at ? ` · tải ${new Date(s.retrieved_at).toLocaleString("vi-VN")}` : ""}</p>
            {s.ingest_error && <p className="mt-1 text-xs text-red-700">Lỗi tải ({s.ingest_attempts} lần): {s.ingest_error}</p>}
            {canApprove && s.status === "needs_review" && <div className="mt-2 flex gap-2">
              <button onClick={() => review(s, "approved")} disabled={busy !== null} className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Duyệt</button>
              <button onClick={() => review(s, "rejected")} disabled={busy !== null} className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">Từ chối</button>
            </div>}
          </li>; })}</ul> : <p className="mt-3 text-sm text-slate-500">Chưa có nguồn nào.</p>}
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">Đang xếp hạng trên tìm kiếm</h3>
        {queries.length ? queries.map((query) => <div key={query} className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{query}</p>
          <ol className="mt-1 space-y-1 text-sm">{data!.signals.filter((s) => s.query === query).slice(0, 5).map((s) =>
            <li key={s.id} className="flex gap-2"><span className="w-5 shrink-0 text-right text-slate-400">{s.rank}.</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-800 hover:text-blue-700 hover:underline">{s.title}</a>
              <Movement signal={s} /><span className="shrink-0 text-xs text-slate-400">{s.domain}</span></li>)}</ol>
        </div>) : <p className="mt-3 text-sm text-slate-500">Chưa chạy tìm kiếm.</p>}
      </div>
    </div>
  </section>;
}
