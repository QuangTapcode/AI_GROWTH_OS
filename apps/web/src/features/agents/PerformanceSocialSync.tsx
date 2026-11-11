'use client';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import PerformanceSocialHistory from './PerformanceSocialHistory';

export default function PerformanceSocialSync({ workspaceId, canEdit, canVerify = false }: { workspaceId: string; canEdit: boolean; canVerify?: boolean }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function verify() {
    setBusy(true);setNotice('');
    try {
      await apiRequest(`/workspaces/${workspaceId}/performance-social`,{method:'POST',body:{action:'verify'}});
      setNotice('Đã xác minh lại Page. Bạn có thể đồng bộ số đếm; quyền đọc từng bài sẽ được kiểm tra khi đồng bộ.');
    } catch(error) { setNotice(error instanceof Error?error.message:'Không xác minh được Page'); }
    finally { setBusy(false); }
  }
  async function sync(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const result = await apiRequest<{ posts: number; measured_posts: number; unavailable_posts: number; requires_reauth?: boolean; reasons?: string[] }>(`/workspaces/${workspaceId}/performance-social`, { method: 'POST', body: { from, to } });
      setNotice(`Đã đọc ${result.posts} bài: ${result.measured_posts} bài có số đếm, ${result.unavailable_posts} bài thiếu số liệu. Hãy tạo báo cáo Performance mới để sử dụng kết quả.`);
      if (result.requires_reauth) setNotice('Token Facebook không hợp lệ hoặc hết hạn. Cần cập nhật quyền và xác minh lại Page; dữ liệu thiếu không được thay bằng 0.');
      else if (result.reasons?.length) setNotice(`Đồng bộ có dữ liệu thiếu: ${result.reasons.join(', ')}. Hãy xem trạng thái nguồn trước khi kết luận.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không đồng bộ được Facebook'); }
    finally { setBusy(false); }
  }
  return <><section className="rounded-2xl border bg-white p-6 space-y-3">
    <h2 className="font-bold">Đọc số liệu bài đăng Facebook</h2>
    <p className="text-sm text-slate-600">Chọn ngày xuất bản, tối đa 20 bài mỗi lần. Chỉ đọc số đếm của bài đã xuất bản trên Page được xác minh cho workspace. Cần cấu hình quyền truy cập ở máy chủ.</p>
    <form onSubmit={sync} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Từ ngày<input aria-label="Ngày xuất bản bắt đầu" type="date" required value={from} onChange={e => setFrom(e.target.value)} className="block rounded border p-2" /></label>
      <label className="text-sm">Đến ngày<input aria-label="Ngày xuất bản kết thúc" type="date" required min={from} value={to} onChange={e => setTo(e.target.value)} className="block rounded border p-2" /></label>
      <button disabled={!canEdit || busy} className="rounded border border-blue-300 p-2 text-blue-700 disabled:opacity-50">{busy ? 'Đang đọc…' : 'Đồng bộ số đếm Facebook'}</button>
    </form>
    {canVerify && <button type="button" disabled={busy} onClick={verify} className="rounded border p-2 text-sm disabled:opacity-50">Xác minh lại Page sau khi cập nhật token</button>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section><PerformanceSocialHistory key={workspaceId} workspaceId={workspaceId} /></>;
}
