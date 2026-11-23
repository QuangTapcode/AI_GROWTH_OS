'use client';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';

type Comparison = { metric: string; baseline_value: number | null; current_value: number | null; absolute_change: number | null;
  relative_change_pct: number | null; baseline_captured_at: string | null; current_captured_at: string | null; status: string; missing_reason: string | null };
type Report = { items: { publishing_job_id: string; artifact_id: string; artifact_version: number; content_hash: string; title: string;
  external_post_id: string; connection_status: string; last_error: string | null; comparisons: Comparison[] }[] };
const status: Record<string,string> = { current_missing: 'Chưa có số hiện tại', baseline_missing: 'Thiếu mốc trước kỳ', zero_baseline: 'Mốc trước bằng 0 — không tính %', compared: 'Đã so sánh hai lần chụp' };
const number = (value: number | null) => value === null ? 'Chưa có dữ liệu' : value.toLocaleString('vi-VN',{maximumFractionDigits:4});

export default function PerformanceSocialHistory({ workspaceId }: { workspaceId: string }) {
  const [from,setFrom] = useState(''), [to,setTo] = useState('');
  const [report,setReport] = useState<Report | null>(null), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false);
  async function read(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(''); setReport(null);
    try { setReport(await apiRequest<Report>(`/workspaces/${workspaceId}/performance-social?${new URLSearchParams({from,to})}`)); }
    catch(error) { setNotice(error instanceof Error ? error.message : 'Không đọc được lịch sử'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-white p-6 space-y-4">
    <h2 className="font-bold">So sánh số liệu Facebook theo kỳ</h2>
    <p className="text-sm text-slate-600">Ngày đo theo UTC. So sánh số tích lũy chụp trước kỳ với lần chụp cuối trong kỳ, trên cùng bài và phiên bản nội dung. Đây không phải reach hoặc số tương tác phát sinh chính xác trong kỳ. Không có mốc trước thì không suy ra tăng trưởng.</p>
    <form onSubmit={read} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Ngày đo bắt đầu<input aria-label="Kỳ so sánh Facebook bắt đầu" type="date" required value={from} onChange={e=>setFrom(e.target.value)} className="block rounded border p-2" /></label>
      <label className="text-sm">Ngày đo kết thúc<input aria-label="Kỳ so sánh Facebook kết thúc" type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)} className="block rounded border p-2" /></label>
      <button disabled={busy} className="rounded border border-blue-300 p-2 text-blue-700 disabled:opacity-50">{busy?'Đang đọc…':'Xem so sánh Facebook'}</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    {report && !report.items.length && <p role="status">Chưa có bài hoặc số chụp phù hợp với kỳ đã chọn.</p>}
    {report?.items.map(post=><article key={post.publishing_job_id} className="rounded-xl border p-4 space-y-2">
      <h3 className="font-semibold">{post.title}</h3>
      <p className="break-all text-xs">Bài: {post.external_post_id} · Artifact: {post.artifact_id} · v{post.artifact_version} · Job: {post.publishing_job_id}</p>
      <p className="break-all text-xs text-slate-500">Hash: {post.content_hash}</p>
      {post.connection_status==='error' && <p role="alert" className="text-sm text-red-700">Kết nối cần xác minh lại: {post.last_error}. Số lưu dưới đây là lịch sử.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Chỉ số','Mốc trước','Hiện tại','Chênh lệch','%','Trạng thái'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{post.comparisons.map(c=><tr key={c.metric} className="border-t"><td className="p-2">{c.metric}</td><td className="p-2">{number(c.baseline_value)}</td><td className="p-2">{number(c.current_value)}</td><td className="p-2">{number(c.absolute_change)}</td><td className="p-2">{c.relative_change_pct===null?'—':`${number(c.relative_change_pct)}%`}</td><td className="p-2">{status[c.status]??c.status}{c.missing_reason?` · ${c.missing_reason}`:''}<p>{c.baseline_captured_at??'Chưa có mốc trước'} → {c.current_captured_at??'Chưa có lần chụp trong kỳ'}</p></td></tr>)}</tbody>
      </table></div>
    </article>)}
  </section>;
}
