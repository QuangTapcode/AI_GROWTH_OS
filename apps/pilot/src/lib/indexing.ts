type Env = Record<string, string | undefined>;

/** Staging stays out of search engines; the production deployment opts in with SITE_INDEXABLE=true. */
function isIndexable(env: Env): boolean {
  return env.SITE_INDEXABLE === "true";
}

function publicUrl(env: Env): string | null {
  return env.NEXT_PUBLIC_SITE_URL ? env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "") : null;
}

export function metaRobots(env: Env) {
  const allowed = isIndexable(env);
  return { index: allowed, follow: allowed };
}

export function robotsRules(env: Env) {
  if (!isIndexable(env)) return { rules: { userAgent: "*", disallow: "/" } };
  const url = publicUrl(env);
  return { rules: { userAgent: "*", allow: "/" }, ...(url ? { sitemap: `${url}/sitemap.xml` } : {}) };
}

export function sitemapEntries(posts: { slug: string; published_at: string }[], env: Env) {
  const url = publicUrl(env);
  if (!url || !isIndexable(env)) return [];
  return [
    { url: `${url}/`, lastModified: undefined as string | undefined },
    ...posts.map((post) => ({ url: `${url}/posts/${post.slug}`, lastModified: post.published_at as string | undefined })),
  ];
}
