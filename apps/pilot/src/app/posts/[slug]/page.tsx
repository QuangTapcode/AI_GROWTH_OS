import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/lib/site";
import { relatedPosts } from "@/lib/related";
import { ArticleBody, parseArticle } from "@/features/site/article";
import { CtaButton, LeadForm, PageView } from "@/features/site/measure";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = await getPost((await params).slug);
  return post ? { title: `${post.title} — TripC`, description: post.meta.description } : { title: "TripC" };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const { blocks, sources, cta } = parseArticle(post.body);
  const label = cta ?? "Ask TripC";
  const related = relatedPosts(post, await listPosts());
  return (
    <main className="shell article">
      <PageView slug={post.slug} />
      <header><Link className="brand" href="/">TripC</Link><span className="badge">Guide</span></header>
      <article>
        <h1>{post.title}</h1>
        <p className="muted">Published {new Date(post.published_at).toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
        <ArticleBody blocks={blocks} />
        <CtaButton slug={post.slug} label={label} />
        {sources.length > 0 && <section className="sources" aria-labelledby="sources">
          <h2 id="sources">Sources</h2>
          <ul>{sources.map((url) => <li key={url}><a href={url} rel="noopener nofollow" target="_blank">{new URL(url).hostname}</a></li>)}</ul>
        </section>}
        {related.length > 0 && <section className="sources" aria-labelledby="related">
          <h2 id="related">Related guides</h2>
          <ul>{related.map((item) => <li key={item.slug}><Link href={`/posts/${item.slug}`}>{item.title}</Link></li>)}</ul>
        </section>}
      </article>
      <section id="request" className="request" aria-labelledby="request-title">
        <h2 id="request-title">{label}</h2>
        <LeadForm topic={post.title} />
      </section>
    </main>
  );
}
