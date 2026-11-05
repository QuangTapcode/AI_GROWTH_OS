import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/indexing";
import { listPosts } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(await listPosts(), process.env);
}
