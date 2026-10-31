"use client";

import { useEffect, useRef } from "react";
import type { ReviewItem } from "../types";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const missingLabel = (value: unknown) => value === "grounded_answer" ? "Chưa có nguồn đã duyệt phù hợp với câu hỏi." : value === "verified_lead_owner_and_consent" ? "Cần xác minh người phụ trách và sự đồng ý của khách." : String(value);

export default function CommunityReviewModal({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const artifact = object(item.jsonPayload.artifact);
  const result = object(object(artifact.payload).result);
  const task = object(item.jsonPayload.task);
  const question = text(object(object(task.payload).input).question);
  const citations = (Array.isArray(result.citations) ? result.citations : Array.isArray(artifact.evidence) ? artifact.evidence : []).map(object);
  const missing = Array.isArray(result.missing_facts) ? result.missing_facts : [];
  const lead = object(result.lead_proposal);
  const needsHelp = result.escalation_required === true || result.status === "insufficient_data";
  return <dialog ref={dialog} aria-labelledby="community-review-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm">
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Community · {item.version}</p><h2 id="community-review-title" className="mt-1 text-xl font-bold">Kiểm tra phản hồi trước khi duyệt</h2><p className="mt-2 text-sm text-slate-500">{item.createdAt} · {item.status === "pending" ? "Đang chờ duyệt" : item.status === "approved" ? "Đã duyệt" : item.status === "rejected" ? "Đã từ chối" : "Trong hàng đợi"}</p></div>
      <button onClick={onClose} aria-label="Đóng bản xem Community" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">✕</button>
    </header>
    <div className="max-h-[65dvh] space-y-6 overflow-y-auto px-6 py-5">
      {result.synthetic === true && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Dữ liệu demo / AI mô phỏng. Kiểm tra lại trước khi sử dụng với khách.</p>}
      <section><h3 className="text-sm font-bold text-slate-500">CÂU HỎI CỦA KHÁCH</h3><p className="mt-2 whitespace-pre-wrap text-base">{question || "Không có câu hỏi gốc trong task này."}</p></section>
      <section><h3 className="text-sm font-bold text-blue-700">PHẢN HỒI ĐỀ XUẤT</h3><div className="mt-2 whitespace-pre-wrap rounded-xl border-l-4 border-blue-600 bg-blue-50 p-4 text-base leading-relaxed">{text(result.reply) || "Chưa có nội dung phản hồi."}</div><p className="mt-2 text-xs text-slate-500">Đây là bản nháp; duyệt không tự gửi phản hồi lên Facebook.</p></section>
      <section><h3 className="text-sm font-bold">Nguồn chứng minh · {citations.length} trích dẫn</h3>{!citations.length && <p className="mt-2 text-sm text-amber-800">Chưa có trích dẫn phù hợp. Không đủ căn cứ để khẳng định thông tin.</p>}<div className="mt-3 space-y-3">{citations.map((citation, index) => { const url = text(citation.source_url); return <blockquote key={index} className="border-l-2 border-slate-300 pl-4"><p className="text-sm leading-relaxed">“{text(citation.quote)}”</p><p className="mt-1 break-words text-xs text-slate-500">{/^https?:\/\//i.test(url) ? <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{url}</a> : "Chưa có đường dẫn nguồn"} · {text(citation.locator)} · Phiên bản {String(citation.source_version ?? "—")}</p><p className="mt-1 text-xs text-slate-500">{text(citation.attribution)}</p></blockquote>; })}</div></section>
      <section className={`rounded-xl p-4 ${needsHelp ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}><h3 className="font-semibold">{needsHelp ? "Cần người phụ trách xử lý" : "Không báo thiếu dữ liệu"}</h3>{missing.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{missing.map((value, index) => <li key={index}>{missingLabel(value)}</li>)}</ul> : <p className="mt-1 text-sm">Agent chưa báo mục thiếu. Người duyệt vẫn cần đối chiếu phản hồi với nguồn.</p>}</section>
      <section><h3 className="font-semibold">Đề xuất lead</h3><p className="mt-2 text-sm text-slate-600">{Object.keys(lead).length ? "Khách có ý định tìm hiểu hoặc tư vấn. Đây là đề xuất chưa lưu thành lead; cần xác minh sự đồng ý và giao người phụ trách trước khi liên hệ." : "Câu hỏi này chưa tạo đề xuất lead."}</p></section>
    </div>
    <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4"><p className="text-xs text-slate-500">Đóng cửa sổ để Approve hoặc Reject trong Review Queue.</p><button onClick={onClose} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Quay lại duyệt</button></footer>
  </dialog>;
}
