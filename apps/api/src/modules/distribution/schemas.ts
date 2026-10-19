import { z } from "zod";

export const CHANNEL_PLATFORMS = ["website", "facebook", "instagram", "linkedin", "email"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const createChannelSchema = z
  .object({
    platform_name: z.enum(CHANNEL_PLATFORMS),
    display_name: z.string().trim().min(1).max(255),
    channel_identifier: z.string().trim().max(255).optional().nullable(),
  })
  .strict();

export const schedulePublishSchema = z
  .object({
    artifact_id: z.string().uuid(),
    channel_id: z.string().uuid(),
    scheduled_for: z.string().datetime({ offset: true }).optional(),
    utm_campaign: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,100}$/i, "utm_campaign may contain letters, digits, '-' and '_' only")
      .optional(),
  })
  .strict();

export const updatePublishingJobSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }).strict(),
  z
    .object({
      action: z.literal("mark_published"),
      external_post_id: z.string().trim().max(255).optional().nullable(),
    })
    .strict(),
]);

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type SchedulePublishInput = z.infer<typeof schedulePublishSchema>;
export type UpdatePublishingJobInput = z.infer<typeof updatePublishingJobSchema>;
