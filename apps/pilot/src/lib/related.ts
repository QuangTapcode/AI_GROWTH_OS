type Linkable = { slug: string; title: string; published_at: string };

const MAX_RELATED = 3;
const IGNORED = new Set(["guide", "in", "the", "for", "and", "of", "to", "a", "an", "by", "da", "nang", "vietnam"]);

function words(title: string): Set<string> {
  return new Set((title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => !IGNORED.has(word)));
}

/** Other posts to link from this one: those sharing the most title words, newest first on a tie. */
export function relatedPosts<T extends Linkable>(current: T, all: T[]): T[] {
  const own = words(current.title);
  const shared = (post: T) => [...words(post.title)].filter((word) => own.has(word)).length;
  return all
    .filter((post) => post.slug !== current.slug)
    .sort((a, b) => shared(b) - shared(a) || b.published_at.localeCompare(a.published_at))
    .slice(0, MAX_RELATED);
}
