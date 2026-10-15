import { z } from "zod";

// 12 Danh mục Tri thức chuẩn hóa theo Mục 9 PRD
export const KNOWLEDGE_CATEGORIES = [
  "company",
  "products",
  "services",
  "locations",
  "audience",
  "pricing",
  "policies",
  "faqs",
  "brand",
  "competitors",
  "content",
  "performance",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const createSourceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(255),
  kind: z.enum(["text", "pdf", "url"]),
  url_or_blob: z.string().min(1, "URL or blob reference is required"),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  content_hash: z.string().optional(),
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export const reviewSourceSchema = z.object({
  decision: z.enum(["approved", "rejected", "revoked"]),
  expected_version: z.number().int().min(1, "expected_version must be >= 1"),
  review_reason: z.string().optional(),
});

export type ReviewSourceInput = z.infer<typeof reviewSourceSchema>;
