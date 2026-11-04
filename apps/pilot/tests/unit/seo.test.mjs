import assert from "node:assert/strict";
import test from "node:test";
import { relatedPosts } from "../../src/lib/related.ts";
import { metaRobots, robotsRules, sitemapEntries } from "../../src/lib/indexing.ts";

const post = (slug, title, published_at = "2026-11-01T00:00:00Z") => ({ slug, title, body: "", meta: {}, published_at });

test("related posts share words with the current title and never include it", () => {
  const current = post("street-food", "Street Food in Da Nang");
  const all = [current, post("coworking", "Coworking in Da Nang"), post("food-markets", "Food Markets for Expats"), post("street-stalls", "Street Food Stalls by the River")];
  assert.deepEqual(relatedPosts(current, all).map((p) => p.slug), ["street-stalls", "food-markets", "coworking"]);
});

test("related posts are capped, and newest wins a tie", () => {
  const current = post("a", "Food guide");
  const all = [current, ...["b", "c", "d", "e"].map((s, i) => post(s, `Food ${s}`, `2026-11-0${i + 1}T00:00:00Z`))];
  assert.deepEqual(relatedPosts(current, all).map((p) => p.slug), ["e", "d", "c"]);
});

test("the site stays out of search engines unless it is explicitly made indexable", () => {
  assert.deepEqual(metaRobots({}), { index: false, follow: false });
  assert.deepEqual(metaRobots({ SITE_INDEXABLE: "false" }), { index: false, follow: false });
  assert.deepEqual(metaRobots({ SITE_INDEXABLE: "true" }), { index: true, follow: true });
  assert.deepEqual(robotsRules({}).rules, { userAgent: "*", disallow: "/" });
  assert.deepEqual(robotsRules({ SITE_INDEXABLE: "true", NEXT_PUBLIC_SITE_URL: "https://guide.tripc.ai/" }),
    { rules: { userAgent: "*", allow: "/" }, sitemap: "https://guide.tripc.ai/sitemap.xml" });
});

test("the sitemap lists every post on the public address, and is empty without one", () => {
  const posts = [post("street-food", "Street Food")];
  assert.deepEqual(sitemapEntries(posts, { SITE_INDEXABLE: "true", NEXT_PUBLIC_SITE_URL: "https://guide.tripc.ai/" }), [
    { url: "https://guide.tripc.ai/", lastModified: undefined },
    { url: "https://guide.tripc.ai/posts/street-food", lastModified: "2026-11-01T00:00:00Z" },
  ]);
  assert.deepEqual(sitemapEntries(posts, { SITE_INDEXABLE: "true" }), []);
  assert.deepEqual(sitemapEntries(posts, { NEXT_PUBLIC_SITE_URL: "https://guide.tripc.ai/" }), []);
});
