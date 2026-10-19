import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
  password: z.string().min(1, "Password is required").max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required").max(256),
  new_password: z.string().min(8, "New password must be at least 8 characters").max(256),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
