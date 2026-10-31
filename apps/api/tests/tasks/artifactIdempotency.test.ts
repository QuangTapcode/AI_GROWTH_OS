import { describe, it, expect, vi, beforeEach } from "vitest";
import { createArtifact, mapTaskRow, WorkflowTaskRow } from "../../src/modules/tasks/repository";
import { AppError } from "../../src/lib/errors";
import pool from "../../src/lib/db";

describe("Artifact Idempotency & OpenAPI Contract Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const taskId = "20000000-0000-4000-8000-000000000001";
  const contentHash = "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0";

  it("Test 1: Worker retry gửi lại đúng payload artifact -> Trả về bản ghi hiện tại một cách Idempotent (không sinh trùng)", async () => {
    const existingArtifact = {
      id: "30000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      task_id: taskId,
      version: 1,
      content_hash: contentHash,
      role: "research",
      operation: "research.run",
      artifact_type: "research_brief",
      title: "Research Brief Da Nang",
      storage: "postgres_ledger",
      payload: { findings: [] },
      evidence: [],
      created_at: new Date().toISOString(),
    };

    // Giả lập database đã có sẵn artifact này
    vi.spyOn(pool, "query").mockImplementation(async (sql: any, params: any) => {
      if (typeof sql === "string" && sql.includes("SELECT * FROM content_artifacts")) {
        return { rows: [existingArtifact], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const result = await createArtifact(workspaceId, {
      task_id: taskId,
      version: 1,
      content_hash: contentHash,
      role: "research",
      operation: "research.run",
      artifact_type: "research_brief",
      title: "Research Brief Da Nang",
      storage: "postgres_ledger",
      payload: { findings: [] },
      evidence: [],
    });

    expect(result.id).toBe(existingArtifact.id);
    expect(result.content_hash).toBe(contentHash);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect((pool.query as any).mock.calls[0][0]).toContain("SELECT * FROM content_artifacts");
  });

  it("Test 2: Gửi cùng task_id và version nhưng hash nội dung bị đổi -> Báo lỗi xung đột 409 ARTIFACT_VERSION_CONFLICT", async () => {
    const existingArtifact = {
      id: "30000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      task_id: taskId,
      version: 1,
      content_hash: contentHash,
      role: "research",
      operation: "research.run",
      artifact_type: "research_brief",
      title: "Research Brief Da Nang",
      storage: "postgres_ledger",
      payload: { findings: [] },
      evidence: [],
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pool, "query").mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("SELECT * FROM content_artifacts")) {
        return { rows: [existingArtifact], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    // Hash khác (nội dung bị sửa trộm hoặc race condition mà không bump version)
    const forgedHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    await expect(
      createArtifact(workspaceId, {
        task_id: taskId,
        version: 1,
        content_hash: forgedHash,
        role: "research",
        operation: "research.run",
        artifact_type: "research_brief",
        title: "Tampered Research Brief",
        storage: "postgres_ledger",
        payload: { findings: ["tampered"] },
        evidence: [],
      })
    ).rejects.toThrow(AppError);

    await expect(
      createArtifact(workspaceId, {
        task_id: taskId,
        version: 1,
        content_hash: forgedHash,
        role: "research",
        operation: "research.run",
        artifact_type: "research_brief",
        title: "Tampered Research Brief",
        storage: "postgres_ledger",
        payload: { findings: ["tampered"] },
        evidence: [],
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ARTIFACT_VERSION_CONFLICT",
    });
  });

  it("Test 3: mapTaskRow đảm bảo tồn tại đồng thời trường 'error' và 'error_details' theo chuẩn OpenAPI 1.1.0", () => {
    const rawDbRow = {
      id: "task-123",
      workspace_id: workspaceId,
      role: "research",
      operation: "research.run",
      status: "failed",
      priority: 3,
      input_version: 1,
      payload: {},
      error_details: { code: "UPSTREAM_TASK_FAILED", reason: "Source expired" },
      retry_count: 1,
      max_retries: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const taskDto = mapTaskRow(rawDbRow);
    expect(taskDto.error).toBeDefined();
    expect(taskDto.error).toEqual(rawDbRow.error_details);
    expect(taskDto.error_details).toEqual(rawDbRow.error_details);
  });
});
