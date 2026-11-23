'use client';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
type Comparison = { metric_name: string; status: string; baseline_value: number | null; current_value: number | null;
  target_value: number | null; absolute_change: number | null; relative_change_pct: number | null;
  measurement?: { unit: string; source: string; definition: string } | null };
export type PerformanceEvidenceData = {
  kpi_comparisons?: Comparison[];
  baseline_window?: { start: string; end: string } | null;
  coverage?: Record<string, { status?: string; from?: string; to?: string; timezone?: string; days?: number; expected_days?: number }>;
  currency?: string | null;
  actions?: { reason: string; metric_name: string; priority: string }[];
  social_posts?: { provider?: string; group_id?: string; publishing_job_id: string; artifact_id: string; artifact_version: number; external_post_id: string;
    captured_at: string; counters: Record<string, number | null>; missing_reasons: Record<string, string> }[];
};

const value = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export default function PerformanceEvidence({ report, artifact }: { report: PerformanceEvidenceData; artifact: { id: string; version: number; content_hash: string } }) {
  const { workspace, canApprove } = useWorkspace();
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function approve(index: number) {
    setBusy(true); setNotice('');
    try {
      const result = await apiRequest<{ task_id: string }>(`/workspaces/${workspace.id}/performance-actions`, { method: 'POST',
        body: { artifact_id: artifact.id, expected_version: artifact.version, expected_hash: artifact.content_hash, action_index: index } });
      setNotice(`Đã duyệt và tạo Research task ${result.task_id}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không duyệt được action'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
    <h2 className="font-bold text-slate-900">KPI, baseline và phạm vi dữ liệu</h2>
    {report.baseline_window && <p className="text-xs text-slate-600">Baseline: {report.baseline_window.start} → {report.baseline_window.end}</p>}
    {report.currency && <p className="text-xs text-slate-600">Tiền tệ: {report.currency}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{['KPI / đơn vị', 'Baseline', 'Hiện tại', 'Mục tiêu', 'Thay đổi', '%', 'Trạng thái'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{report.kpi_comparisons?.map(c => <tr key={c.metric_name} className="border-t border-slate-100" title={c.measurement?.definition}>
        <td className="p-2">{c.metric_name} · {c.measurement?.unit ?? '—'}</td><td className="p-2">{value(c.baseline_value)}</td>
        <td className="p-2">{value(c.current_value)}</td><td className="p-2">{value(c.target_value)}</td>
        <td className="p-2">{value(c.absolute_change)}</td><td className="p-2">{c.relative_change_pct == null ? '—' : `${value(c.relative_change_pct)}%`}</td>
        <td className="p-2">{c.status}</td></tr>)}</tbody></table></div>
    {!report.kpi_comparisons?.length && <p className="text-sm text-slate-500">Chưa có baseline để so sánh.</p>}
    {Object.entries(report.coverage ?? {}).map(([metric, coverage]) => <p key={metric} className="text-xs text-slate-600">
      {metric}: {coverage.status} · {coverage.from} → {coverage.to} · {coverage.timezone}
      {coverage.expected_days != null ? ` · ${coverage.days ?? 0}/${coverage.expected_days} ngày` : ''}
    </p>)}
    {!!report.social_posts?.length && <div className="space-y-3">
      <h3 className="font-semibold">Facebook: số đếm theo bài đăng</h3>
      <p className="text-xs text-slate-600">Số tích lũy tại thời điểm chụp; không phải lượt tiếp cận trong kỳ hoặc chuyển đổi từ quảng cáo.</p>
      {report.social_posts.map(post => <div key={post.publishing_job_id} className="rounded border p-3 text-xs space-y-1">
        <p>{post.provider === 'facebook_group' ? 'Nhóm Facebook' : 'Fanpage'} · Bài đăng: {post.external_post_id} · Phiên bản nội dung: {post.artifact_version}</p>
        <p>Artifact: {post.artifact_id} · Chụp lúc: {post.captured_at}</p>
        {['reactions', 'comments', 'shares'].map(metric => <p key={metric}>{metric}: {post.counters[metric] == null ? `Chưa có dữ liệu (${post.missing_reasons[metric] ?? 'không được trả về'})` : value(post.counters[metric])}</p>)}
      </div>)}
    </div>}
    {notice && <p role="status" className="text-sm text-blue-700">{notice}</p>}
    {report.actions?.map((action, index) => <div key={index} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Đề xuất cần duyệt · {action.reason}
      {canApprove && <button disabled={busy} onClick={() => approve(index)} className="ml-3 rounded border p-2 disabled:opacity-50">Duyệt và tạo Research task</button>}</div>)}
  </section>;
}
