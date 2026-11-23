export const SITE_ID = process.env.NEXT_PUBLIC_SITE_ID || "tripc-pilot";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:4000/v1").replace(/\/$/, "");
// Public routes live beside /v1 on the API origin.
export const PUBLIC_BASE = `${API_BASE.replace(/\/v1$/, "")}/public/v1/sites/${SITE_ID}`;
export const COMMUNITY_GROUP_URL =
  process.env.NEXT_PUBLIC_COMMUNITY_GROUP_URL || "https://www.facebook.com/groups/1134282109069209";
export const COMMUNITY_GROUP_NAME =
  process.env.NEXT_PUBLIC_COMMUNITY_GROUP_NAME || "Cộng đồng Du lịch & Sống tại Việt Nam";

export type PublicPost = {
  title: string;
  slug: string;
  body: string;
  meta: { description?: string; locale?: string; og_image?: string };
  published_at: string;
};

async function getJson<T>(path: string): Promise<{ok:true;data:T}|{ok:false;status:number}> {
  try {
    const response = await fetch(`${process.env.PILOT_BUILD_API_BASE_URL??PUBLIC_BASE}${path}`, { cache: process.env.PILOT_EXPORT==='true'?'force-cache':"no-store", signal: AbortSignal.timeout(10000) });
    return response.ok ? {ok:true,data:(await response.json()) as T} : {ok:false,status:response.status};
  } catch {
    return {ok:false,status:503};
  }
}

export async function postsResult():Promise<{posts:PublicPost[];unavailable:boolean}>{
  const response=await getJson<{items?:PublicPost[];posts?:PublicPost[];next_cursor?:string|null}|PublicPost[]>('/posts');
  if(!response.ok){
    if(process.env.PILOT_EXPORT==='true')throw Error('Published content API is unavailable; refusing to export an incomplete site');
    return {posts:[],unavailable:true};
  }
  const body=response.data,posts=Array.isArray(body)?body:body.items??body.posts;
  if(!Array.isArray(posts))throw Error('Invalid public content response');
  // A static export must include every page, not just the first API page.
  let cursor=Array.isArray(body)?null:body.next_cursor;
  const seen=new Set<string>();
  while(cursor){
    if(seen.has(cursor)||seen.size>=100)throw Error('Public content pagination did not complete');seen.add(cursor);
    const next=await getJson<{items:PublicPost[];next_cursor?:string|null}>(`/posts?cursor=${encodeURIComponent(cursor)}`);
    if(!next.ok)throw Error('Could not load the complete guide collection');
    posts.push(...next.data.items);cursor=next.data.next_cursor;
  }
  return {posts,unavailable:false};
}

export async function listPosts(): Promise<PublicPost[]> {
  return (await postsResult()).posts;
}

export async function getPost(slug: string): Promise<PublicPost | null> {
  const body = await getJson<PublicPost | { post?: PublicPost }>(`/posts/${encodeURIComponent(slug)}`);
  if (!body.ok){if(body.status===404)return null;throw Error('Guide service is temporarily unavailable');}
  return "post" in body.data && body.data.post ? body.data.post : (body.data as PublicPost);
}
