import type { ReactNode } from "react";

const SOURCE = /^\[source:[^\]]+\]\((https?:\/\/[^)\s]+)\)$/;
const CONTACT = /^\[Request information\]\(\/contact\)\s*[—-]\s*(.+)$/;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** Inline text with http(s) links only; everything else is rendered as plain text (no HTML). */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index! > last) out.push(text.slice(last, match.index));
    out.push(<a key={`${key}-${match.index}`} href={match[2]} rel="noopener nofollow" target="_blank">{match[1]}</a>);
    last = match.index! + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Splits the stored article into readable blocks, the cited sources and the CTA text. */
export function parseArticle(markdown: string) {
  const blocks: { kind: "h2" | "p"; text: string }[] = [];
  const sources: string[] = [];
  let cta: string | null = null;
  for (const raw of markdown.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.every((l) => SOURCE.test(l))) { lines.forEach((l) => sources.push(l.match(SOURCE)![1])); continue; }
    const contact = block.match(CONTACT);
    if (contact) { cta = contact[1].trim(); continue; }
    if (block.startsWith("## ")) blocks.push({ kind: "h2", text: block.slice(3).trim() });
    else blocks.push({ kind: "p", text: lines.join(" ") });
  }
  return { blocks, sources: [...new Set(sources)], cta };
}

export function ArticleBody({ blocks }: { blocks: ReturnType<typeof parseArticle>["blocks"] }) {
  return <>{blocks.map((b, i) => b.kind === "h2"
    ? <h2 key={i}>{b.text}</h2>
    : <p key={i}>{inline(b.text, String(i))}</p>)}</>;
}
