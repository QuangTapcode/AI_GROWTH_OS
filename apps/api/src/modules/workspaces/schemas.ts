import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and hyphens"),
  timezone: z.string().default("Asia/Bangkok"),
  default_language: z.string().default("en"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const addMemberSchema = z.object({
  email: z.string().email("Invalid email format"),
  role: z.enum(["owner", "editor", "viewer"]),
  full_name: z.string().optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UserRole = "owner" | "editor" | "viewer";
