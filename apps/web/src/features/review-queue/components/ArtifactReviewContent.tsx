import type { ContentArtifact } from "@/lib/apiTypes";

const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const labels: Record<string, string> = {
  topic: "Chủ đề", audience_fit: "Phù hợp khách hàng", offer_fit: "Phù hợp dịch vụ", rationale: "Lý do đề xuất", user_need: "Nhu cầu khách hàng", keywords: "Từ khóa", confidence: "Mức tin cậy", hypothesis: "Giả thuyết", quote: "Trích dẫn", url: "Nguồn", fetched_at: "Thời điểm thu thập",
  objective: "Mục tiêu", selected_opportunity: "Cơ hội được chọn", opportunity_score: "Điểm cơ hội", tasks: "Công việc đề xuất", brief: "Yêu cầu công việc", role: "Agent phụ trách", operation: "Thao tác", deadline: "Hạn hoàn thành", audience: "Đối tượng", offer: "Dịch vụ", deliverable: "Sản phẩm bàn giao", acceptance: "Tiêu chí nghiệm thu", cta: "Lời kêu gọi hành động",
  reply: "Phản hồi đề xuất", caption: "Nội dung bài social", channels: "Kênh đăng", alt_text: "Mô tả ảnh", image_assets: "Tài nguyên ảnh", title: "Tiêu đề", meta_description: "Mô tả tìm kiếm", primary_keyword: "Từ khóa chính", headings: "Bố cục bài viết", body_markdown: "Nội dung bài viết", document_markdown: "Nội dung", summary: "Tóm tắt", observations: "Nhận xét", proposal: "Đề xuất tiếp theo", experiment: "Đề xuất thử nghiệm", window: "Khoảng thời gian", start: "Bắt đầu", end: "Kết thúc", control_variant: "Phương án đối chứng", treatment_variant: "Phương án thử nghiệm", primary_metric: "Chỉ số chính", grouping: "Cách phân nhóm", seo_checks: "Kiểm tra SEO", lead_proposal: "Đề xuất lead", intent: "Ý định", requires_consent: "Cần sự đồng ý", owner: "Người phụ trách", status: "Trạng thái", topic_clusters: "Nhóm chủ đề", opportunities: "Các cơ hội", description: "Mô tả", missing_facts: "Dữ liệu còn thiếu", grounded_answer: "Chưa có nguồn phù hợp", verified_lead_owner_and_consent: "Chưa xác minh người phụ trách và sự đồng ý", qualified_visits: "Lượt truy cập phù hợp", leads: "Lead", impressions: "Lượt hiển thị", clicks: "Lượt nhấp", metrics: "Số liệu", insufficient_data: "Thiếu dữ liệu", draft: "Bản nháp", ready_for_handoff: "Sẵn sàng bàn giao", proposed: "Đề xuất", blocked: "Đang bị chặn", source_url: "Đường dẫn nguồn", locator: "Vị trí trích dẫn", attribution: "Ghi công nguồn", license: "Giấy phép",
};
labels.hook = "Opening hook"; labels.facebook = "Bài đăng Facebook"; labels.key_points = "Key points"; labels.hashtags = "Hashtags";
const hidden = new Set(["workspace_id", "context_snapshot_id", "profile_version", "input_version", "input_artifact_refs", "research_artifact", "task_id", "article_id", "pack_id", "brief_id", "plan_id", "parent_content_id", "content_hash", "artifact_id", "chunk_id", "source_id", "snapshot_id", "metric_snapshot_id", "requires_human_approval", "applied", "synthetic", "evidence", "citations", "version", "tools", "depends_on", "dependency_artifact_from"]);

function Value({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null) return <span className="text-slate-500">Chưa có dữ liệu</span>;
  if (typeof value === "boolean") return <span className={value ? "text-emerald-700" : "text-amber-800"}>{value ? "Có / Đạt" : "Không / Chưa đạt"}</span>;
  if (typeof value === "string" || typeof value === "number") return <p className="whitespace-pre-wrap break-words leading-relaxed">{labels[String(value)] ?? String(value)}</p>;
  if (Array.isArray(value)) return value.length ? <ul className="space-y-3">{value.map((entry, index) => <li key={index} className="border-l-2 border-blue-200 pl-3"><Value value={entry} depth={depth + 1} /></li>)}</ul> : <p className="text-slate-500">Chưa có mục nào.</p>;
  if (depth > 5) return <p className="text-slate-500">Xem chi tiết kỹ thuật để kiểm tra thêm.</p>;
  return <dl className="space-y-3">{Object.entries(obj(value)).filter(([key]) => !hidden.has(key)).map(([key, entry]) => <div key={key}><dt className="mb-1 text-xs font-semibold text-slate-500">{labels[key] ?? key.replaceAll("_", " ")}</dt><dd><Value value={entry} depth={depth + 1} /></dd></div>)}</dl>;
}

export default function ArtifactReviewContent({ artifact, task }: { artifact: ContentArtifact; task?: unknown }) {
  const payload = artifact.payload;
  const result = Object.keys(obj(payload.result)).length ? obj(payload.result) : payload;
  const roleTitles: Record<string, string> = { research: "Kết quả nghiên cứu", growth_lead: "Kế hoạch tăng trưởng", seo: "Bản thảo SEO", content: "Nội dung đề xuất", community: "Phản hồi Community", performance: "Báo cáo hiệu suất" };
  const fields: Record<string, string[]> = {
    research: ["summary", "findings", "keywords", "user_need"],
    growth_lead: ["objective", "summary", "selected_opportunity", "opportunity_score", "tasks", "opportunities", "topic_clusters", "cta"],
    seo: ["title", "primary_keyword", "meta_description", "headings", "body_markdown", "document_markdown", "seo_checks", "cta"],
    content: ["summary", "facebook", "caption", "hook", "key_points", "hashtags", "channels", "cta", "alt_text", "image_assets", "document_markdown"],
    community: ["reply", "lead_proposal"],
    performance: ["window", "metrics", "observations", "proposal", "experiment"],
  };
  const keys = (fields[artifact.role] ?? ["summary", "document_markdown"]).filter((key) => key in result);
  const missing = list(result.missing_facts);
  const evidence = artifact.evidence.length ? artifact.evidence : list(result.citations).map(obj);
  const question = obj(obj(obj(task).payload).input).question;
  return <div className="space-y-6 p-5 text-sm" data-testid="artifact-review-content">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-slate-900">{roleTitles[artifact.role] ?? "Nội dung cần duyệt"}</h3><span className="rounded-md bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{labels[String(result.status)] ?? String(result.status ?? "Chờ kiểm tra")}</span></div>
    {result.synthetic === true && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Dữ liệu demo / AI mô phỏng. Cần kiểm tra trước khi sử dụng thực tế.</p>}
    {question != null && <section><h4 className="mb-2 font-semibold">Câu hỏi của khách</h4><Value value={question} /></section>}
    {keys.map((key) => <section key={key} className="border-t border-slate-100 pt-4"><h4 className="mb-3 font-bold text-blue-800">{key === "findings" ? `Phát hiện nghiên cứu · ${list(result.findings).length}` : labels[key] ?? key}</h4><Value value={key === "facebook" ? obj(result.facebook).text : result[key]} /></section>)}
    {!keys.length && <p className="text-slate-600">Chưa có nội dung phù hợp để xem trước cho kết quả này.</p>}
    <section className={`rounded-lg p-4 ${missing.length || result.escalation_required === true ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}><h4 className="mb-2 font-semibold">{missing.length || result.escalation_required === true ? "Dữ liệu thiếu / Cần người xử lý" : "Kiểm tra dữ liệu"}</h4>{missing.length ? <Value value={missing} /> : <p>Agent chưa liệt kê dữ liệu thiếu. Người duyệt vẫn cần kiểm tra nguồn.</p>}</section>
    <section className="border-t border-slate-200 pt-4"><h4 className="mb-3 font-bold">Bằng chứng và nguồn · {evidence.length}</h4>{evidence.length ? evidence.map((entry, index) => { const citation = obj(entry); const url = String(citation.source_url ?? citation.url ?? ""); return <blockquote key={index} className="mb-4 border-l-2 border-blue-300 pl-4"><Value value={citation.quote ?? citation.note ?? "Không có đoạn trích"} /><p className="mt-2 break-all text-xs text-slate-500">{/^https?:\/\//i.test(url) ? <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{url}</a> : "Chưa có đường dẫn nguồn"} · {String(citation.locator ?? "")}</p></blockquote>; }) : <p className="text-slate-500">Chưa đính kèm bằng chứng nguồn.</p>}</section>
  </div>;
}
