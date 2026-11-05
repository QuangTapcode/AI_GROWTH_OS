const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const NO_CLAIM: Record<string, string> = { hook: "Câu mở đầu", cta: "Kêu gọi hành động" };

/** Hook and CTA must state no fact; every other sentence needs the cited quote that backs it. */
function verdict(kind: string, status: unknown, sourced: boolean) {
  const clean = status === "supported";
  if (NO_CLAIM[kind]) return clean
    ? { label: `${NO_CLAIM[kind]} · không nêu dữ kiện`, tone: "bg-slate-100 text-slate-700" }
    : { label: `${NO_CLAIM[kind]} · có nêu dữ kiện, cần kiểm tra`, tone: "bg-amber-50 text-amber-900" };
  if (sourced && clean) return { label: "Có nguồn", tone: "bg-emerald-50 text-emerald-800" };
  if (sourced && status === "partial") return { label: "Khớp một phần", tone: "bg-amber-50 text-amber-900" };
  return { label: "Chưa có nguồn", tone: "bg-rose-50 text-rose-800" };
}

/** Each sentence of the post beside the source quote it restates, so a reviewer can check it line by line. */
export default function SentenceSources({ result }: { result: Record<string, unknown> }) {
  const rows = list(result.sentence_fact_map).map(obj);
  if (!rows.length) return null;
  const facts = new Map(list(result.extracted_facts).map(obj).map((fact) => [fact.fact_id, fact]));
  return <section className="border-t border-slate-100 pt-4">
    <h4 className="mb-1 font-bold text-blue-800">Câu và nguồn của câu · {rows.length} câu</h4>
    <p className="mb-3 text-xs text-slate-500">Hệ thống so khớp theo từ khoá nên "Có nguồn" chưa có nghĩa là câu đúng hoàn toàn. Người duyệt vẫn cần đọc trích dẫn để xác nhận.</p>
    <ul className="space-y-3">{rows.map((row, index) => {
      const quotes = list(row.fact_id).flatMap((id): Record<string, unknown>[] => { const fact = facts.get(id); return fact ? [fact] : []; });
      const { label, tone } = verdict(String(row.sentence_type), row.entailment_status, quotes.length > 0);
      return <li key={index} data-testid="sentence-source" className="rounded-lg border border-slate-100 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 break-words leading-relaxed text-slate-900">{String(row.text ?? "")}</p>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
        </div>
        {quotes.map((fact) => {
          const url = String(fact.source_url ?? "");
          return <blockquote key={String(fact.fact_id)} className="mt-2 border-l-2 border-blue-200 pl-3 text-xs text-slate-600">
            <p className="whitespace-pre-wrap break-words">{String(fact.text ?? "")}</p>
            {/^https?:\/\//i.test(url) && <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-blue-700 underline">{url}</a>}
          </blockquote>;
        })}
      </li>;
    })}</ul>
  </section>;
}
