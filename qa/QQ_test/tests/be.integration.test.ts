import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pool, { query } from "../../../apps/api/src/lib/db";
import type { AuthUser } from "../../../apps/api/src/lib/auth";
import * as workspaces from "../../../apps/api/src/modules/workspaces/service";
import * as sources from "../../../apps/api/src/modules/sources/service";
import * as workspaceRoute from "../../../apps/api/src/app/v1/workspaces/route";
import * as detailRoute from "../../../apps/api/src/app/v1/workspaces/[workspace_id]/route";
import * as sourceRoute from "../../../apps/api/src/app/v1/workspaces/[workspace_id]/sources/[source_id]/route";
import * as reviewRoute from "../../../apps/api/src/app/v1/workspaces/[workspace_id]/sources/[source_id]/review/route";

const sourceInput = {
  title: "QQ synthetic housing guide", kind: "text", url_or_blob: "Synthetic text for merge verification",
  category: "locations", content_hash: "qq-synthetic-hash",
};
function user(label: string): AuthUser {
  const id = randomUUID();
  return { id, email: `qq-${label}-${id}@example.test`, name: `QQ ${label}` };
}
async function fixture() {
  const owner = user("owner");
  const outsider = user("outsider");
  const editor = user("editor");
  const viewer = user("viewer");
  const workspace = await workspaces.createWorkspace(owner, { name: "QQ Tenant A", slug: `qq-${randomUUID()}` });
  const otherWorkspace = await workspaces.createWorkspace(outsider, { name: "QQ Tenant B", slug: `qq-${randomUUID()}` });
  for (const [member, role] of [[editor, "editor"], [viewer, "viewer"]] as const) {
    const created = await workspaces.addWorkspaceMember(owner, workspace.id, { email: member.email, full_name: member.name, role });
    member.id = created.user_id;
  }
  const source = await sources.createWorkspaceSource(editor, workspace.id, sourceInput);
  return { owner, outsider, editor, viewer, workspace, otherWorkspace, source };
}
let f: Awaited<ReturnType<typeof fixture>>;
const appError = (statusCode: number, code?: string) => code ? { statusCode, code } : { statusCode };
function request(method: string, actor?: AuthUser, body?: unknown) {
  return new Request("http://qq.local/v1/workspaces", {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer dev_user_${actor.id}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as Parameters<typeof workspaceRoute.POST>[0];
}
function sourceParams() {
  return { params: { workspace_id: f.workspace.id, source_id: f.source.id } };
}
async function expectEnvelope(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body.error.code).toBe(code);
  expect(body.error.request_id).toEqual(expect.any(String));
  expect(body.error.request_id.length).toBeGreaterThan(0);
  expect(body.error).not.toHaveProperty("stack");
  return body;
}

beforeAll(async () => {
  const expected = process.env.QQ_TEST_DATABASE;
  if (!expected || !/^qq_test_\d+_[0-9a-f]{6}$/.test(expected) || !process.env.DATABASE_URL) {
    throw new Error("Run via npm test or npm run test:db; an isolated QQ database is required.");
  }
  expect(new URL(process.env.DATABASE_URL).pathname).toBe("/" + expected);
  const actual = await query<{ name: string }>("SELECT current_database() AS name");
  expect(actual.rows[0].name).toBe(expected);
});
beforeEach(async () => { f = await fixture(); });
afterAll(async () => { await pool.end(); });

describe("QQ BE merge — database", () => {
  it("QQ-DB-002: migrated tables and vector(768) match BE/AI boundary", async () => {
    const result = await query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'");
    expect(result.rows.map(row => row.name)).toEqual(expect.arrayContaining([
      "users", "workspaces", "memberships", "business_profiles", "sources", "source_chunks", "source_facts", "growth_goals", "agent_tasks",
    ]));
    const column = await query<{ type: string }>(
      "SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'source_chunks'::regclass AND attname = 'embedding'",
    );
    expect(column.rows[0].type).toBe("vector(768)");
  });
  it("QQ-DB-003: foreign-key constraint prevents orphan memberships", async () => {
    await expect(query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'viewer')", [randomUUID(), f.owner.id]))
      .rejects.toMatchObject({ code: "23503" });
  });
});

describe("QQ BE merge — workspaces and members", () => {
  it("QQ-WS-001: workspace creates active owner and business profile", async () => {
    const member = await query("SELECT role,status FROM memberships WHERE workspace_id=$1 AND user_id=$2", [f.workspace.id, f.owner.id]);
    expect(member.rows).toEqual([{ role: "owner", status: "active" }]);
    const profile = await query("SELECT workspace_id FROM business_profiles WHERE workspace_id=$1", [f.workspace.id]);
    expect(profile.rows).toEqual([{ workspace_id: f.workspace.id }]);
  });
  it("QQ-WS-002: owner list contains the created workspace", async () => {
    expect((await workspaces.listUserWorkspaces(f.owner)).items.map(w => w.id)).toContain(f.workspace.id);
  });
  it("QQ-WS-003: outsider list excludes another tenant workspace", async () => {
    const ids = (await workspaces.listUserWorkspaces(f.outsider)).items.map(w => w.id);
    expect(ids).toContain(f.otherWorkspace.id);
    expect(ids).not.toContain(f.workspace.id);
  });
  it("QQ-WS-004: outsider cannot read workspace detail", async () => {
    await expect(workspaces.getWorkspaceDetail(f.outsider, f.workspace.id)).rejects.toMatchObject(appError(403));
  });
  it("QQ-WS-005: owner adds an active editor with persisted membership", async () => {
    const member = await query("SELECT role,status FROM memberships WHERE workspace_id=$1 AND user_id=$2", [f.workspace.id, f.editor.id]);
    expect(member.rows).toEqual([{ role: "editor", status: "active" }]);
  });
  it("QQ-WS-006: editor reads workspace after being added", async () => {
    expect((await workspaces.getWorkspaceDetail(f.editor, f.workspace.id)).id).toBe(f.workspace.id);
  });
  it("QQ-WS-007: editor cannot add members and rejected user is not created", async () => {
    const email = `rejected-${randomUUID()}@example.test`;
    await expect(workspaces.addWorkspaceMember(f.editor, f.workspace.id, { email, role: "viewer" })).rejects.toMatchObject(appError(403));
    expect((await query("SELECT id FROM users WHERE email=$1", [email])).rowCount).toBe(0);
  });
  it("QQ-WS-008: member list exposes owner/editor/viewer in the correct workspace", async () => {
    const members = (await workspaces.listWorkspaceMembers(f.viewer, f.workspace.id)).items;
    expect(members).toHaveLength(3);
    expect(members.map(m => m.role).sort()).toEqual(["editor", "owner", "viewer"]);
    expect(members.every(m => m.workspace_id === f.workspace.id)).toBe(true);
  });
  it("QQ-WS-009: owner revocation persists suspended membership", async () => {
    expect(await workspaces.revokeWorkspaceMember(f.owner, f.workspace.id, f.viewer.id)).toEqual({ success: true });
    const member = await query("SELECT status FROM memberships WHERE workspace_id=$1 AND user_id=$2", [f.workspace.id, f.viewer.id]);
    expect(member.rows[0].status).toBe("suspended");
  });
  it("QQ-WS-010: revoked member immediately loses detail and list access", async () => {
    await workspaces.revokeWorkspaceMember(f.owner, f.workspace.id, f.viewer.id);
    await expect(workspaces.getWorkspaceDetail(f.viewer, f.workspace.id)).rejects.toMatchObject(appError(403));
    expect((await workspaces.listUserWorkspaces(f.viewer)).items.map(w => w.id)).not.toContain(f.workspace.id);
  });
  it("QQ-WS-011: last owner cannot be revoked and retains access", async () => {
    await expect(workspaces.revokeWorkspaceMember(f.owner, f.workspace.id, f.owner.id))
      .rejects.toMatchObject(appError(400, "CANNOT_REVOKE_LAST_OWNER"));
    expect((await workspaces.getWorkspaceDetail(f.owner, f.workspace.id)).id).toBe(f.workspace.id);
  });
  it("QQ-WS-012: duplicate workspace slug returns conflict without extra row", async () => {
    await expect(workspaces.createWorkspace(f.owner, { name: "Duplicate", slug: f.workspace.slug }))
      .rejects.toMatchObject(appError(409, "SLUG_ALREADY_EXISTS"));
    expect((await query("SELECT id FROM workspaces WHERE slug=$1", [f.workspace.slug])).rowCount).toBe(1);
  });
});

describe("QQ BE merge — source lifecycle", () => {
  it("QQ-SRC-001: editor creates persisted imported source version 1", async () => {
    const source = await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id);
    expect(source).toMatchObject({ ...sourceInput, workspace_id: f.workspace.id, status: "imported", version: 1 });
  });
  it("QQ-SRC-002: viewer upload is forbidden and creates no source", async () => {
    await expect(sources.createWorkspaceSource(f.viewer, f.workspace.id, sourceInput)).rejects.toMatchObject(appError(403));
    expect((await sources.listWorkspaceSources(f.owner, f.workspace.id)).items).toHaveLength(1);
  });
  it("QQ-SRC-003: foreign tenant cannot read source or list", async () => {
    await expect(sources.getWorkspaceSourceDetail(f.outsider, f.workspace.id, f.source.id)).rejects.toMatchObject(appError(403));
    await expect(sources.listWorkspaceSources(f.outsider, f.workspace.id)).rejects.toMatchObject(appError(403));
    expect((await sources.listWorkspaceSources(f.outsider, f.otherWorkspace.id)).items).toEqual([]);
  });
  it("QQ-SRC-004: editor cannot approve and source remains imported", async () => {
    await expect(sources.reviewWorkspaceSource(f.editor, f.workspace.id, f.source.id, { decision: "approved", expected_version: 1 }))
      .rejects.toMatchObject(appError(403));
    expect(await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).toMatchObject({ status: "imported", version: 1 });
  });
  it("QQ-SRC-005: stale version returns conflict without mutating source", async () => {
    await expect(sources.reviewWorkspaceSource(f.owner, f.workspace.id, f.source.id, { decision: "approved", expected_version: 99 }))
      .rejects.toMatchObject(appError(409, "VERSION_CONFLICT"));
    expect(await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).toMatchObject({ status: "imported", version: 1 });
  });
  it("QQ-SRC-006: owner approval persists version 2 and reviewer", async () => {
    await sources.reviewWorkspaceSource(f.owner, f.workspace.id, f.source.id, { decision: "approved", expected_version: 1 });
    const saved = await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id);
    expect(saved).toMatchObject({ status: "approved", version: 2, reviewed_by: f.owner.id });
    expect(saved.reviewed_at).toBeTruthy();
  });
  it("QQ-SRC-007: owner revokes approved source and persists version 3", async () => {
    await sources.reviewWorkspaceSource(f.owner, f.workspace.id, f.source.id, { decision: "approved", expected_version: 1 });
    await sources.reviewWorkspaceSource(f.owner, f.workspace.id, f.source.id, { decision: "revoked", expected_version: 2 });
    expect(await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).toMatchObject({ status: "revoked", version: 3 });
  });
  it("QQ-SRC-008: delete is soft and preserves database row", async () => {
    await sources.deleteWorkspaceSource(f.owner, f.workspace.id, f.source.id);
    const stored = await query("SELECT status,deleted_at FROM sources WHERE id=$1", [f.source.id]);
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].status).toBe("deleted");
    expect(stored.rows[0].deleted_at).toBeTruthy();
  });
  it("QQ-SRC-009: deleted source is absent from active list and detail", async () => {
    await sources.deleteWorkspaceSource(f.owner, f.workspace.id, f.source.id);
    expect((await sources.listWorkspaceSources(f.owner, f.workspace.id)).items).toEqual([]);
    await expect(sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).rejects.toMatchObject(appError(404, "NOT_FOUND"));
  });
  it("QQ-SRC-010: viewer cannot delete and source remains visible", async () => {
    await expect(sources.deleteWorkspaceSource(f.viewer, f.workspace.id, f.source.id)).rejects.toMatchObject(appError(403));
    expect((await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).deleted_at).toBeNull();
  });
  it("QQ-SRC-011: source ID from a different tenant returns 404 to an authorized local owner", async () => {
    await expect(sources.getWorkspaceSourceDetail(f.outsider, f.otherWorkspace.id, f.source.id))
      .rejects.toMatchObject(appError(404, "NOT_FOUND"));
  });
  it("QQ-SRC-012: status/category filters exclude nonmatching sources", async () => {
    await sources.createWorkspaceSource(f.editor, f.workspace.id, { ...sourceInput, category: "policies" });
    await sources.reviewWorkspaceSource(f.owner, f.workspace.id, f.source.id, { decision: "approved", expected_version: 1 });
    const filtered = await sources.listWorkspaceSources(f.viewer, f.workspace.id, { status: "approved", category: "locations" });
    expect(filtered.items.map(s => s.id)).toEqual([f.source.id]);
  });
});

describe("QQ BE merge — in-process API route contracts", () => {
  it("QQ-HTTP-001: missing token returns 401 with error envelope", async () => {
    await expectEnvelope(await workspaceRoute.GET(request("GET")), 401, "UNAUTHORIZED");
  });
  it("QQ-HTTP-002: invalid workspace payload returns 422 with field errors", async () => {
    const body = await expectEnvelope(await workspaceRoute.POST(request("POST", f.owner, {})), 422, "VALIDATION_FAILED");
    expect(body.error.field_errors.name.length).toBeGreaterThan(0);
    expect(body.error.field_errors.slug.length).toBeGreaterThan(0);
  });
  it("QQ-HTTP-003: workspace POST returns 201 with persisted ownership", async () => {
    const response = await workspaceRoute.POST(request("POST", f.owner, { name: "Route workspace", slug: `route-${randomUUID()}` }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect((await workspaces.getWorkspaceDetail(f.owner, body.id)).id).toBe(body.id);
  });
  it("QQ-HTTP-004: cross-tenant detail returns 403 instead of another tenant payload", async () => {
    const response = await detailRoute.GET(request("GET", f.outsider), { params: { workspace_id: f.workspace.id } });
    const body = await expectEnvelope(response, 403, "FORBIDDEN");
    expect(JSON.stringify(body)).not.toContain(f.workspace.name);
  });
  it("QQ-HTTP-005: viewer DELETE returns 403 and preserves source", async () => {
    await expectEnvelope(await sourceRoute.DELETE(request("DELETE", f.viewer), sourceParams()), 403, "PERMISSION_DENIED");
    expect((await sources.getWorkspaceSourceDetail(f.owner, f.workspace.id, f.source.id)).deleted_at).toBeNull();
  });
  it("QQ-HTTP-006: review stale version returns 409 VERSION_CONFLICT", async () => {
    await expectEnvelope(await reviewRoute.POST(request("POST", f.owner, { decision: "approved", expected_version: 99 }), sourceParams()), 409, "VERSION_CONFLICT");
  });
  it("QQ-HTTP-007: deleted source GET returns 404 NOT_FOUND", async () => {
    await sources.deleteWorkspaceSource(f.owner, f.workspace.id, f.source.id);
    await expectEnvelope(await sourceRoute.GET(request("GET", f.owner), sourceParams()), 404, "NOT_FOUND");
  });
  it("QQ-HTTP-008: revoked viewer loses access on the next route call", async () => {
    await workspaces.revokeWorkspaceMember(f.owner, f.workspace.id, f.viewer.id);
    await expectEnvelope(await detailRoute.GET(request("GET", f.viewer), { params: { workspace_id: f.workspace.id } }), 403, "FORBIDDEN");
  });
});
