import { PoolClient } from "pg";
import { query } from "@/lib/db";
import { CreateWorkspaceInput } from "./schemas";
import { Role } from "@/lib/tenant";

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_language: string;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  status: string;
  created_at: string;
  updated_at: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

/**
 * Đảm bảo người dùng tồn tại trong bảng users (hỗ trợ dev authentication tokens)
 */
export async function ensureUserExists(
  id: string,
  email: string,
  fullName: string,
  client?: PoolClient
): Promise<void> {
  const sql = `
    INSERT INTO users (id, email, full_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = NOW()
  `;
  if (client) {
    await client.query(sql, [id, email, fullName]);
  } else {
    await query(sql, [id, email, fullName]);
  }
}

/**
 * Tìm hoặc tạo user qua email (dùng khi mời thêm thành viên vào workspace)
 */
export async function findOrCreateUserByEmail(
  email: string,
  fullName?: string,
  client?: PoolClient
): Promise<{ id: string; email: string; full_name: string }> {
  const existingSql = `SELECT id, email, full_name FROM users WHERE email = $1`;
  const existing = client
    ? await client.query(existingSql, [email])
    : await query(existingSql, [email]);

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const defaultName = fullName || email.split("@")[0];
  const sql = `
    INSERT INTO users (email, full_name)
    VALUES ($1, $2)
    RETURNING id, email, full_name
  `;
  const res = client
    ? await client.query(sql, [email, defaultName])
    : await query(sql, [email, defaultName]);
  return res.rows[0];
}

/**
 * Lấy danh sách workspace mà người dùng có membership active
 */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceRow[]> {
  const sql = `
    SELECT w.id, w.name, w.slug, w.timezone, w.default_language, w.created_at, w.updated_at
    FROM workspaces w
    INNER JOIN memberships m ON m.workspace_id = w.id
    WHERE m.user_id = $1 AND m.status = 'active'
    ORDER BY w.created_at DESC
  `;
  const res = await query<WorkspaceRow>(sql, [userId]);
  return res.rows;
}

/**
 * Lấy thông tin chi tiết một workspace theo ID
 */
export async function getWorkspaceById(id: string): Promise<WorkspaceRow | null> {
  const res = await query<WorkspaceRow>(
    `SELECT id, name, slug, timezone, default_language, created_at, updated_at 
     FROM workspaces WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Kiểm tra slug đã tồn tại chưa
 */
export async function getWorkspaceBySlug(slug: string): Promise<WorkspaceRow | null> {
  const res = await query<WorkspaceRow>(
    `SELECT id, name, slug, timezone, default_language, created_at, updated_at 
     FROM workspaces WHERE slug = $1`,
    [slug]
  );
  return res.rows[0] || null;
}

/**
 * Tạo mới workspace trong transaction:
 * 1. Đảm bảo user tạo tồn tại
 * 2. Thêm workspace
 * 3. Thêm membership gán quyền 'owner' cho người tạo
 * 4. Tạo business profile khởi tạo cho TripC
 */
export async function createWorkspaceWithDefaults(
  client: PoolClient,
  data: CreateWorkspaceInput,
  creator: { id: string; email: string; name: string }
): Promise<WorkspaceRow> {
  await ensureUserExists(creator.id, creator.email, creator.name, client);

  const wsRes = await client.query<WorkspaceRow>(
    `INSERT INTO workspaces (name, slug, timezone, default_language)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, timezone, default_language, created_at, updated_at`,
    [data.name, data.slug, data.timezone, data.default_language]
  );
  const workspace = wsRes.rows[0];

  await client.query(
    `INSERT INTO memberships (workspace_id, user_id, role, status)
     VALUES ($1, $2, 'owner', 'active')`,
    [workspace.id, creator.id]
  );

  await client.query(
    `INSERT INTO business_profiles (
      workspace_id, company_name, website_url, industry, target_locations, target_audiences, 
      products_services, brand_voice
    ) VALUES (
      $1, $2, 'https://tripc.vn', 'Travel & Expat Housing', 
      ARRAY['Da Nang'], 
      ARRAY['English-speaking expats living or planning to live in Da Nang'],
      ARRAY['housing', 'living_areas', 'coworking', 'gym', 'food', 'events'],
      'helpful, local expert, reliable'
    )`,
    [workspace.id, data.name]
  );

  return workspace;
}

/**
 * Lấy danh sách thành viên active trong workspace
 */
export async function listMembers(workspaceId: string): Promise<MemberRow[]> {
  const sql = `
    SELECT 
      m.id, m.workspace_id, m.user_id, m.role, m.status, m.created_at, m.updated_at,
      u.email, u.full_name, u.avatar_url
    FROM memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = $1 AND m.status = 'active'
    ORDER BY m.created_at ASC
  `;
  const res = await query<MemberRow>(sql, [workspaceId]);
  return res.rows;
}

/**
 * Đếm số lượng owner active còn lại trong workspace
 */
export async function countActiveOwners(workspaceId: string): Promise<number> {
  const res = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM memberships 
     WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'`,
    [workspaceId]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Thêm hoặc cập nhật vai trò thành viên
 */
export async function addOrUpdateMembership(
  workspaceId: string,
  userId: string,
  role: Role
): Promise<void> {
  await query(
    `INSERT INTO memberships (workspace_id, user_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (workspace_id, user_id) 
     DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
    [workspaceId, userId, role]
  );
}

/**
 * Thu hồi quyền thành viên: cập nhật status = 'suspended'
 * Có hiệu lực tức thì ở request kế tiếp do middleware query status = 'active'
 */
export async function revokeMembership(workspaceId: string, userId: string): Promise<void> {
  await query(
    `UPDATE memberships 
     SET status = 'suspended', updated_at = NOW() 
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
}
