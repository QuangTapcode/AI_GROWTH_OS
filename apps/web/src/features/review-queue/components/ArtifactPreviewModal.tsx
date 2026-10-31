"use client";

import { useEffect, useRef } from "react";
import type { ContentArtifact } from "@/lib/apiTypes";
import type { ReviewItem } from "../types";
import ArtifactReviewContent from "./ArtifactReviewContent";

export default function ArtifactPreviewModal({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="artifact-preview-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm">
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><h2 id="artifact-preview-title" className="text-lg font-bold">Xem kết quả · {item.agent}</h2><p className="mt-1 text-xs text-slate-500">{item.version} · {item.createdAt}</p></div><button onClick={onClose} aria-label="Đóng bản xem kết quả" className="rounded-lg px-3 py-2 hover:bg-slate-100">✕</button></header>
    <div className="max-h-[65dvh] overflow-y-auto">{item.jsonPayload.artifact ? <ArtifactReviewContent artifact={item.jsonPayload.artifact as ContentArtifact} task={item.jsonPayload.task} /> : <p className="p-5">Chưa có artifact để xem.</p>}</div>
    <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4"><p className="text-xs text-slate-500">Kiểm tra nội dung và nguồn trước khi duyệt.</p><button onClick={onClose} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Quay lại duyệt</button></footer>
  </dialog>;
}
