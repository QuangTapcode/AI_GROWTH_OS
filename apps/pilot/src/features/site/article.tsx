import type { ReactNode } from "react";

const SOURCE = /^\[source:[^\]]+\]\((https?:\/\/[^)\s]+)\)$/;
const CONTACT = /^\[Request information\]\(\/contact\)\s*[—-]\s*(.+)$/;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Inline text with http(s) links only; everything else is rendered as plain text (no HTML). */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index! > last) out.push(text.slice(last, match.index));
    if(match[2])out.push(<a key={`${key}-${match.index}`} href={match[2]} rel="noopener nofollow" target="_blank">{match[1]}</a>);
    else if(match[3])out.push(<strong key={`${key}-${match.index}`}>{match[3]}</strong>);
    else out.push(<code key={`${key}-${match.index}`}>{match[4]}</code>);
    last = match.index! + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Splits the stored article into readable blocks, the cited sources and the CTA text. */
export function parseArticle(markdown: string) {
  const blocks: { kind: "h2" | "h3" | "p" | "ul" | "ol"; text: string }[] = [];
  const sources: string[] = [];
  let cta: string | null = null;
  for (const raw of markdown.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.every((l) => SOURCE.test(l))) { lines.forEach((l) => sources.push(l.match(SOURCE)![1])); continue; }
    const contact = block.match(CONTACT);
    if (contact) { cta = contact[1].trim(); continue; }
    if (/^#{1,2} /.test(block)) blocks.push({ kind: "h2", text: block.replace(/^#{1,2} /,'').trim() });
    else if(block.startsWith('### '))blocks.push({kind:'h3',text:block.slice(4).trim()});
    else if(lines.every(l=>/^[-*] /.test(l)))blocks.push({kind:'ul',text:lines.map(l=>l.slice(2)).join('\n')});
    else if(lines.every(l=>/^\d+\. /.test(l)))blocks.push({kind:'ol',text:lines.map(l=>l.replace(/^\d+\. /,'')).join('\n')});
    else blocks.push({ kind: "p", text: lines.join(" ") });
  }
  return { blocks, sources: [...new Set(sources)].filter(url=>{try{return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}}), cta };
}

export function ArticleBody({ blocks }: { blocks: ReturnType<typeof parseArticle>["blocks"] }) {
  return <>{blocks.map((b,i)=>{
    if(b.kind==='h2')return <h2 key={i}>{b.text}</h2>;
    if(b.kind==='h3')return <h3 key={i}>{b.text}</h3>;
    if(b.kind==='ul'||b.kind==='ol'){
      const items=b.text.split('\n').map((line,j)=><li key={j}>{inline(line,`${i}-${j}`)}</li>);
      return b.kind==='ul'?<ul key={i}>{items}</ul>:<ol key={i}>{items}</ol>;
    }
    return <p key={i}>{inline(b.text,String(i))}</p>;
  })}</>;
}
