'use client';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/api';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { useApiData } from '@/lib/useApiData';

type Experiment = { id: string; hypothesis: string; content_slug: string | null; control_cta: string; treatment_cta: string;
  status: string; starts_at: string; ends_at: string; min_exposures: number;
  results: { status: string; winner: string | null; variants: { variant: string; exposures: number; conversions: number; conversion_rate: number | null }[] } };

export default function PerformanceExperiments() {
  const { workspace, canEdit, canApprove } = useWorkspace();
  const path = `/workspaces/${workspace.id}/experiments`;
  const { data, error, reload } = useApiData(path, signal => apiRequest<{ items: Experiment[] }>(path, { signal }));
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setNotice('');
    try {
      await apiRequest(path, { method: 'POST', body: {
        hypothesis: String(values.get('hypothesis')), content_slug: String(values.get('slug') ?? '').trim() || null,
        control_cta: String(values.get('control')), treatment_cta: String(values.get('treatment')),
        starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + Number(values.get('days')) * 86400000).toISOString(),
        min_exposures: Number(values.get('sample')),
      } });
      setNotice('Đã tạo bản nháp. Owner cần duyệt cả hai CTA trước khi chạy.'); reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không tạo được thử nghiệm'); }
    finally { setBusy(false); }
  }
  async function change(id: string, action: 'start' | 'stop') {
    setBusy(true); setNotice('');
    try { await apiRequest(path, { method: 'PATCH', body: { id, action } }); reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Không cập nhật được'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
    <h2 className="font-bold">Thử nghiệm hai CTA</h2>
    <p className="text-xs text-slate-500">Đo lead đã lưu trên mỗi visitor được hiển thị CTA. Kết luận sau hết kỳ, đủ mẫu cho cả hai nhóm và khoảng tin cậy tách biệt. Dừng sớm không chọn winner.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
    {notice && <p role="status" className="text-sm text-blue-700">{notice}</p>}
    {canEdit && <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 text-sm">
      <label>Giả thuyết<input name="hypothesis" required minLength={5} maxLength={500} className="block w-full border rounded p-2" /></label>
      <label>Slug bài viết (để trống: landing)<input name="slug" maxLength={160} className="block w-full border rounded p-2" /></label>
      <label>CTA control<input name="control" required maxLength={200} className="block w-full border rounded p-2" /></label>
      <label>CTA treatment<input name="treatment" required maxLength={200} className="block w-full border rounded p-2" /></label>
      <label>Số ngày<input name="days" type="number" min={1} max={90} defaultValue={14} required className="block w-full border rounded p-2" /></label>
      <label>Mẫu tối thiểu mỗi nhóm<input name="sample" type="number" min={100} max={1000000} defaultValue={100} required className="block w-full border rounded p-2" /></label>
      <button disabled={busy} className="rounded bg-blue-600 p-2 text-white disabled:opacity-50">Tạo bản nháp thử nghiệm</button>
    </form>}
    {data?.items.map(experiment => <article key={experiment.id} className="border rounded-xl p-4 space-y-2 text-sm">
      <h3 className="font-bold">{experiment.hypothesis}</h3><p>{experiment.content_slug ?? 'Landing'} · {experiment.status} · {experiment.starts_at} → {experiment.ends_at}</p>
      <p>Control: {experiment.control_cta} · Treatment: {experiment.treatment_cta}</p>
      <p>{experiment.results.status} · Winner: {experiment.results.winner ?? 'Chưa đủ bằng chứng'}</p>
      {experiment.results.variants.map(v => <p key={v.variant}>{v.variant}: {v.exposures} exposure · {v.conversions} lead · {v.conversion_rate == null ? '—' : `${(100*v.conversion_rate).toFixed(2)}%`}</p>)}
      {canApprove && experiment.status === 'draft' && <button disabled={busy} onClick={() => change(experiment.id,'start')} className="rounded border p-2 text-blue-700">Duyệt hai CTA và bắt đầu</button>}
      {canApprove && experiment.status === 'running' && <button disabled={busy} onClick={() => change(experiment.id,'stop')} className="rounded border p-2 text-red-700">Dừng thử nghiệm</button>}
    </article>)}
  </section>;
}
