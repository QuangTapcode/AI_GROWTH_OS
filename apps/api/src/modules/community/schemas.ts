import { z } from 'zod';

export const communityPlatformSchema = z.enum([
  'facebook_comment',
  'facebook_message',
  'website_comment',
  'manual',
  'tripc_chat',
]);

export const communityStatusSchema = z.enum([
  'received',
  'queued',
  'replied',
  'escalated',
  'ignored',
]);

export const receiveMessageInputSchema = z.object({
  platform: communityPlatformSchema.default('manual'),
  external_id: z.string().max(255).optional(),
  author_name: z.string().min(1).max(255),
  author_contact: z.string().max(255).optional(),
  content: z.string().min(1).max(2000),
  post_url: z.string().url().optional().or(z.literal('')),
  metadata: z.record(z.unknown()).optional().default({}),
  auto_enqueue: z.boolean().optional().default(true),
});

export const updateMessageStatusSchema = z.object({
  status: communityStatusSchema,
  lead_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ReceiveMessageInput = z.infer<typeof receiveMessageInputSchema>;
export type UpdateMessageStatusInput = z.infer<typeof updateMessageStatusSchema>;
export type CommunityPlatform = z.infer<typeof communityPlatformSchema>;
export type CommunityStatus = z.infer<typeof communityStatusSchema>;

export interface CommunityMessageRecord {
  id: string;
  workspace_id: string;
  platform: CommunityPlatform;
  external_id: string | null;
  author_name: string;
  author_contact: string | null;
  content: string;
  post_url: string | null;
  status: CommunityStatus;
  task_id: string | null;
  lead_id: string | null;
  metadata: Record<string, unknown>;
  received_at: string;
  created_at: string;
  updated_at: string;
}
