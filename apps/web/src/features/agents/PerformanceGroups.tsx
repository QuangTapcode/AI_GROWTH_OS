'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type Group = {group_id:string;period_from:string;period_to:string;captured_at:string;source_url:string;
  total_members:number|null;metrics:Record<string,number|null>;missing_reasons:Record<string,string>};
type Post = {publishing_job_id:string;artifact_id:string;artifact_version:number;group_id:string;external_post_id:string;
  external_content_modified?:boolean;captured_at:string;counters:Record<string,number|null>};
const labels:Record<string,string>={posts:'Bài viết',comments:'Bình luận',reactions:'Cảm xúc',new_members:'Thành viên mới',shares:'Chia sẻ'};
export default function PerformanceGroups({workspaceId}:{workspaceId:string}){
  const [data,setData]=useState<{groups:Group[];posts:Post[]}|null>(null);
  const [error,setError]=useState('');
  async function load(){
    setError('');
    try{setData(await apiRequest(`/workspaces/${workspaceId}/performance-groups`));}
    catch(e){setError(e instanceof Error?e.message:'Không đọc được thống kê nhóm');}
  }
  useEffect(()=>{let active=true;
    apiRequest<{groups:Group[];posts:Post[]}>(`/workspaces/${workspaceId}/performance-groups`).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Không đọc được thống kê nhóm');});
    return()=>{active=false;};},[workspaceId]);
  return <section className="rounded-2xl border bg-white p-6 space-y-3">
    <h2 className="font-bold">Đo lường nhóm Facebook</h2>
    <p className="text-sm text-slate-600">Nguồn: trình duyệt đã đăng nhập và có quyền xem thống kê nhóm. Kỳ của Facebook được giữ riêng với kỳ báo cáo website. Thành viên hiện tại không phải thành viên mới.</p>
    <button onClick={load} className="rounded border p-2 text-sm">Tải lại số liệu đã đồng bộ của nhóm</button>
    {error&&<p role="alert">{error}</p>}
    {!error&&!data&&<p>Đang đọc…</p>}
    {data&&!data.groups.length&&<p>Chưa có thống kê nhóm được đồng bộ.</p>}
    {data?.groups.map(g=><div key={g.group_id} className="rounded border p-4 space-y-2 text-sm">
      <a href={g.source_url} target="_blank" rel="noreferrer" className="text-blue-700">Nhóm {g.group_id} · Xem nguồn</a>
      <p>Kỳ Facebook: {g.period_from} → {g.period_to} · Múi giờ: Facebook chưa cung cấp</p>
      <p>Đồng bộ lúc: {new Date(g.captured_at).toLocaleString('vi-VN')}</p>
      {Object.keys(labels).filter(k=>k!=='shares').map(k=><p key={k}>{labels[k]}: {g.metrics[k]==null?'Chưa có dữ liệu':g.metrics[k]}</p>)}
      <p>Thành viên hiện tại: {g.total_members??'Chưa có dữ liệu'}</p>
    </div>)}
    {data?.posts.map(p=><div key={p.publishing_job_id} className="rounded border p-4 space-y-1 text-sm">
      <a target="_blank" rel="noreferrer" className="text-blue-700" href={`https://www.facebook.com/groups/${p.group_id}/posts/${p.external_post_id}/`}>Bài do hệ thống đăng: {p.external_post_id}</a>
      {p.external_content_modified&&<p className="text-amber-800">Bài đã được chỉnh sửa trên Facebook sau khi duyệt.</p>}
      <p>Artifact {p.artifact_id} · Phiên bản {p.artifact_version}</p>
      <p>Số tích lũy tại {new Date(p.captured_at).toLocaleString('vi-VN')}, không phải tổng trong kỳ:</p>
      {['reactions','comments','shares'].map(k=><p key={k}>{labels[k]}: {p.counters[k]==null?'Chưa có dữ liệu':p.counters[k]}</p>)}
    </div>)}
  </section>;
}
