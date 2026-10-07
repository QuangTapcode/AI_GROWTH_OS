/**
 * W1-MY-05 — DTO whitelist cho public read.
 * Response CHỈ chứa title/slug/body/meta/published_at; mọi field nội bộ
 * (draft/source/evidence/member/lead/workspace/status/...) bị strip tại mapper.
 */
export interface PublicPostMeta {
  description?: string;
  tags?: string[];
  locale?: string;
  og_image?: string;
}

export interface PublicPostDto {
  title: string;
  slug: string;
  body: string;
  meta: PublicPostMeta;
  published_at: string;
}

/** Snapshot nội bộ (mock DB) — có chủ đích cả field cấm để test whitelist. */
export interface ContentSnapshot {
  id: string;
  kind: 'post' | 'landing';
  site_id: string;
  workspace_id: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
  slug: string;
  body: string;
  meta: Record<string, unknown>;
  published_at: string | null;
  // ---- internal-only: không bao giờ được ra public ----
  member_id?: string;
  author_email?: string;
  lead_capture?: Record<string, unknown>;
  source_refs?: Array<Record<string, unknown>>;
  evidence?: Array<Record<string, unknown>>;
  review_notes?: string;
  preview_token?: string;
  content_version?: number;
}

const PUBLIC_META_KEYS = ['description', 'tags', 'locale', 'og_image'] as const;

/** Meta whitelist: chỉ giữ key public đã biết, bỏ key lạ (chặn lọt dữ liệu nội bộ). */
export function toPublicMeta(meta: Record<string, unknown>): PublicPostMeta {
  const out: PublicPostMeta = {};
  for (const key of PUBLIC_META_KEYS) {
    const value = meta[key];
    if (value === undefined) continue;
    if (key === 'description' || key === 'locale' || key === 'og_image') {
      if (typeof value === 'string') out[key] = value;
    } else if (key === 'tags') {
      if (Array.isArray(value) && value.every((t) => typeof t === 'string')) out.tags = value as string[];
    }
  }
  return out;
}

/** Map snapshot → DTO. Trả null nếu không phải published snapshot hợp lệ. */
export function toPublicPost(snap: ContentSnapshot): PublicPostDto | null {
  if (snap.status !== 'published') return null;
  if (!snap.published_at) return null;
  return {
    title: snap.title,
    slug: snap.slug,
    body: snap.body,
    meta: toPublicMeta(snap.meta ?? {}),
    published_at: snap.published_at,
  };
}