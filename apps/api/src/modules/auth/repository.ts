import { query } from "../../lib/db";
import { Role } from "../../lib/tenant";

export interface CredentialRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  password_hash: string | null;
}

export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  last_login_at: string | null;
}

export interface UserWorkspaceRow {
  workspace_id: string;
  name: string;
  slug: string;
  role: Role;
}

export async function findCredentialsByEmail(email: string): Promise<CredentialRow | null> {
  const res = await query<CredentialRow>(
    `SELECT id, email, full_name, avatar_url, password_hash
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return res.rows[0] || null;
}

export async function recordLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

export async function setPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await query(
    `UPDATE users SET password_hash = $1, password_updated_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [passwordHash, userId]
  );
}

export async function getUserProfile(userId: string): Promise<UserProfileRow | null> {
  const res = await query<UserProfileRow>(
    `SELECT id, email, full_name, avatar_url, last_login_at FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

export async function listActiveMemberships(userId: string): Promise<UserWorkspaceRow[]> {
  const res = await query<UserWorkspaceRow>(
    `SELECT w.id AS workspace_id, w.name, w.slug, m.role
     FROM memberships m
     INNER JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.status = 'active'
     ORDER BY w.created_at ASC`,
    [userId]
  );
  return res.rows;
}
