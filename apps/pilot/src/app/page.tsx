import Link from "next/link";
import { listPosts } from "@/lib/site";
import { CommunityGroupCard, PageView, CtaButton, LeadForm } from "@/features/site/measure";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const posts = await listPosts();
  return (
    <main className="shell">
      <PageView slug={null} />
      <header>
        <a className="brand" href="/">TripC</a>
        <span className="badge">Da Nang · English guides</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Da Nang · English website pilot</p>
        <h1>Your next chapter in Da Nang.</h1>
        <p className="lead">Practical, sourced guides about housing, coworking and everyday life for English-speaking newcomers.</p>
        <CtaButton slug={null} label="Ask TripC" />
      </section>
      <section aria-labelledby="guides">
        <h2 id="guides">Guides</h2>
        {posts.length ? <ul className="post-list">{posts.map((post) => <li key={post.slug}>
          <Link href={`/posts/${post.slug}`}>{post.title}</Link>
          {post.meta.description && <p className="muted">{post.meta.description}</p>}
        </li>)}</ul> : <p className="muted">No guides are published yet.</p>}
      </section>
      <section id="request" className="request"><h2>Ask TripC</h2><LeadForm topic="General information" /></section>
      <CommunityGroupCard slug={null} />
      <footer className="muted"><span>© TripC</span></footer>
    </main>
  );
}
