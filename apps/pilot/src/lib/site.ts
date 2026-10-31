export const SITE_ID = process.env.NEXT_PUBLIC_SITE_ID || "tripc-pilot";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:4000/v1").replace(/\/$/, "");
// Public routes live beside /v1 on the API origin.
export const PUBLIC_BASE = `${API_BASE.replace(/\/v1$/, "")}/public/v1/sites/${SITE_ID}`;

export type PublicPost = {
  title: string;
  slug: string;
  body: string;
  meta: { description?: string; locale?: string };
  published_at: string;
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${PUBLIC_BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function listPosts(): Promise<PublicPost[]> {
  const body = await getJson<{ items?: PublicPost[]; posts?: PublicPost[] } | PublicPost[]>("/posts");
  if (!body) return [];
  return Array.isArray(body) ? body : body.items ?? body.posts ?? [];
}

export async function getPost(slug: string): Promise<PublicPost | null> {
  const body = await getJson<PublicPost | { post?: PublicPost }>(`/posts/${encodeURIComponent(slug)}`);
  if (!body) return null;
  return "post" in body && body.post ? body.post : (body as PublicPost);
}
