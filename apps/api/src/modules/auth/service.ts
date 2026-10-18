import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { getDummyPasswordHash, verifyPassword } from "../../lib/password";
import { issueSessionToken } from "../../lib/session-token";
import { loginSchema } from "./schemas";
import * as repo from "./repository";

/**
 * Giới hạn đăng nhập sai theo email và theo IP (in-memory, một process API).
 * Đủ cho pilot một instance; nhiều instance cần chuyển sang store chung.
 */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function recentFailures(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function resetLoginThrottle(): void {
  failures.clear();
}

export async function login(rawInput: unknown, clientIp: string) {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid login payload", fieldErrors);
  }

  const { email, password } = parsed.data;
  const now = Date.now();
  const keys = [`email:${email}`, `ip:${clientIp}`];
  if (keys.some((key) => recentFailures(key, now).length >= MAX_FAILURES)) {
    throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Try again in 15 minutes.");
  }

  const user = await repo.findCredentialsByEmail(email);
  const valid = await verifyPassword(password, user?.password_hash ?? (await getDummyPasswordHash()));
  if (!user || !user.password_hash || !valid) {
    for (const key of keys) recentFailures(key, now).push(now);
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  for (const key of keys) failures.delete(key);
  await repo.recordLogin(user.id);
  const issued = issueSessionToken({ id: user.id, email: user.email, name: user.full_name });

  return {
    access_token: issued.token,
    token_type: "Bearer",
    expires_at: issued.expiresAt,
    user: { id: user.id, email: user.email, full_name: user.full_name, avatar_url: user.avatar_url },
  };
}

export async function getCurrentUser(user: AuthUser) {
  const profile = await repo.getUserProfile(user.id);
  if (!profile) {
    throw new AppError(401, "UNAUTHORIZED", "User no longer exists");
  }
  const workspaces = await repo.listActiveMemberships(user.id);
  return { user: profile, workspaces };
}
