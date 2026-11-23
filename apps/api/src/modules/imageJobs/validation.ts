import { z } from "zod";
import { ALLOWED_ASPECT_RATIOS } from "./constants";

/**
 * Zod validation schema for POST /api/v1/image-jobs
 */
export const CreateImageJobSchema = z.object({
  workspace_id: z.string().uuid("workspace_id must be a valid UUID").optional(),
  article_id: z.string().uuid("article_id must be a valid UUID").optional().nullable(),
  post_id: z.string().uuid("post_id must be a valid UUID").optional().nullable(),
  prompt: z
    .string({ required_error: "prompt is required" })
    .trim()
    .min(1, "prompt must not be empty")
    .max(1000, "prompt must not exceed 1000 characters"),
  negative_prompt: z.string().trim().max(1000, "negative_prompt must not exceed 1000 characters").optional(),
  aspect_ratio: z
    .enum(ALLOWED_ASPECT_RATIOS, {
      errorMap: () => ({
        message: `aspect_ratio must be one of [${ALLOWED_ASPECT_RATIOS.join(", ")}]`,
      }),
    })
    .default("1:1"),
  seed: z.coerce
    .number()
    .int("seed must be an integer")
    .positive("seed must be a positive integer")
    .max(9007199254740991, "seed must be within safe integer bounds")
    .optional(),
  steps: z.coerce
    .number()
    .int("steps must be an integer")
    .min(20, "steps must be at least 20")
    .max(50, "steps must be at most 50")
    .optional()
    .default(30),
  cfg_scale: z.coerce
    .number()
    .min(1.0, "cfg_scale must be at least 1.0")
    .max(15.0, "cfg_scale must be at most 15.0")
    .optional()
    .default(7.0),
  scheduler: z.string().trim().optional(),
  model_key: z.string().trim().optional(),
  preferred_provider: z.string().trim().optional().default("gpu_worker"),
});

export type CreateImageJobInput = z.infer<typeof CreateImageJobSchema>;

