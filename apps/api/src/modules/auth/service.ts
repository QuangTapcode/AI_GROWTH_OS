import type { ZodError } from "zod";
import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "../../lib/password";
import { issueSessionToken, sessionExpiry } from "../../lib/session-token";
import { assertActiveSession } from "../../lib/tenant";
import { changePasswordSchema, loginSchema } from "./schemas";
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

function validationError(error: ZodError, message: string): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".");
    fieldErrors[field] = fieldErrors[field] || [];
    fieldErrors[field].push(issue.message);
  }
  return new AppError(422, "VALIDATION_FAILED", message, fieldErrors);
}

export interface ClientMeta {
  ip: string;
  userAgent: string | null;
}

export async function login(rawInput: unknown, client: ClientMeta) {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error, "Invalid login payload");

  const { email, password } = parsed.data;
  const now = Date.now();
  const keys = [`email:${email}`, `ip:${client.ip}`];
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
  const issuedAt = new Date(now);
  const sessionId = await repo.createSession(user.id, sessionExpiry(issuedAt), client);
  await repo.recordLogin(user.id);
  const issued = issueSessionToken({ id: user.id, email: user.email, name: user.full_name }, issuedAt, sessionId);

  return {
    access_token: issued.token,
    token_type: "Bearer",
    expires_at: issued.expiresAt,
    user: { id: user.id, email: user.email, full_name: user.full_name, avatar_url: user.avatar_url },
  };
}

/** Thu hồi phiên hiện tại; token của phiên này bị từ chối ở mọi request sau. */
export async function logout(user: AuthUser) {
  const revoked = user.sessionId ? await repo.revokeSession(user.id, user.sessionId) : false;
  return { success: true, session_revoked: revoked };
}

/** Đổi mật khẩu: kiểm tra mật khẩu hiện tại, giữ phiên đang dùng, thu hồi các phiên khác. */
export async function changePassword(user: AuthUser, rawInput: unknown) {
  await assertActiveSession(user);
  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error, "Invalid password change payload");

  const currentHash = await repo.getPasswordHash(user.id);
  if (!currentHash || !(await verifyPassword(parsed.data.current_password, currentHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
  }
  if (parsed.data.current_password === parsed.data.new_password) {
    throw new AppError(422, "PASSWORD_UNCHANGED", "New password must differ from the current password");
  }

  await repo.setPasswordHash(user.id, await hashPassword(parsed.data.new_password));
  const revoked = await repo.revokeOtherSessions(user.id, user.sessionId ?? null);
  return { success: true, other_sessions_revoked: revoked };
}

export async function getCurrentUser(user: AuthUser) {
  await assertActiveSession(user);
  const profile = await repo.getUserProfile(user.id);
  if (!profile) {
    throw new AppError(401, "UNAUTHORIZED", "User no longer exists");
  }
  const workspaces = await repo.listActiveMemberships(user.id);
  return { user: profile, workspaces };
}
