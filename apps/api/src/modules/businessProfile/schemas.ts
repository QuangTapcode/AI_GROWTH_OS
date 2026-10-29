import { z } from "zod";
import { researchStrategySchema } from './strategy';

const textList = z.array(z.string().trim().min(1).max(200)).max(30);

/**
 * Cập nhật hồ sơ doanh nghiệp (business_profiles) với OCC theo expected_version.
 * Field không gửi thì giữ nguyên; gửi null để xóa field cho phép null.
 */
export const updateBusinessProfileSchema = z
  .object({
    expected_version: z.number().int().min(1),
    company_name: z.string().trim().min(1).max(255).optional(),
    website_url: z.string().trim().url().max(500).nullable().optional(),
    industry: z.string().trim().max(100).nullable().optional(),
    overview: z.string().max(5000).nullable().optional(),
    target_locations: textList.optional(),
    target_audiences: textList.optional(),
    products_services: textList.optional(),
    competitors: textList.optional(),
    research_strategy: researchStrategySchema.nullable().optional(),
    brand_voice: z.string().trim().max(100).nullable().optional(),
    brand_guidelines: z.string().max(10000).nullable().optional(),
    safety_rules: z.record(z.boolean()).optional(),
  })
  .strict();

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;

export const EDITABLE_PROFILE_FIELDS = [
  "company_name",
  "website_url",
  "industry",
  "overview",
  "target_locations",
  "target_audiences",
  "products_services",
  "competitors",
  "research_strategy",
  "brand_voice",
  "brand_guidelines",
  "safety_rules",
] as const;
