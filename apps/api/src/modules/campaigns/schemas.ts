import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(2, "Campaign name must be at least 2 characters").max(255),
  utm_campaign: z.string().min(2, "utm_campaign is required").max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD format").optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD format").optional().nullable(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
