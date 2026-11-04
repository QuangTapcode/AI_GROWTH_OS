import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/indexing";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsRules(process.env);
}
