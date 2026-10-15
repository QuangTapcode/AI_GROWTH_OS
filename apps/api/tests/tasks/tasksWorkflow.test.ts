import { describe, it, expect } from "vitest";
import {
  createWorkflowTaskSchema,
  updateTaskStatusSchema,
  createArtifactSchema,
  TASK_ROLES,
} from "../../src/modules/tasks/schemas";

describe("Workflow Tasks & Artifacts Schemas (TQ-03)", () => {
  it("chỉ chấp nhận đúng 6 roles hợp lệ trong allowlist", () => {
    expect(TASK_ROLES).toEqual([
      "research",
      "growth_lead",
      "seo",
      "content",
      "community",
      "performance",
    ]);

    for (const role of TASK_ROLES) {
      const validPayload = {
        role,
        operation: `${role}.execute`,
        priority: 3,
        input_version: 1,
      };
      const result = createWorkflowTaskSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    }
  });

  it("từ chối vai trò lạ hoặc ngoài allowlist với thông báo lỗi rõ ràng", () => {
    const invalidPayload = {
      role: "unknown_sales_agent",
      operation: "sales.pitch",
    };
    const result = createWorkflowTaskSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("role"));
      expect(issue?.message).toContain("Unknown or unsupported role");
    }
  });

  it("validate danh sách dependencies phải là các UUID hợp lệ", () => {
    const invalidDep = {
      role: "seo",
      operation: "seo.draft",
      dependencies: ["not-a-uuid-string"],
    };
    const result = createWorkflowTaskSchema.safeParse(invalidDep);
    expect(result.success).toBe(false);

    const validDep = {
      role: "seo",
      operation: "seo.draft",
      dependencies: ["11111111-1111-4000-8000-000000000001"],
    };
    const validResult = createWorkflowTaskSchema.safeParse(validDep);
    expect(validResult.success).toBe(true);
  });

  it("bắt buộc mã băm content_hash của Artifact phải đúng chuẩn 64-char hex SHA-256", () => {
    const invalidHashArtifact = {
      role: "research",
      operation: "research.run",
      artifact_type: "research_brief",
      title: "Expat Housing Brief",
      content_hash: "invalid-short-hash",
    };
    const result = createArtifactSchema.safeParse(invalidHashArtifact);
    expect(result.success).toBe(false);

    const validHashArtifact = {
      role: "research",
      operation: "research.run",
      artifact_type: "research_brief",
      title: "Expat Housing Brief",
      content_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      storage: "postgres_ledger",
    };
    const validResult = createArtifactSchema.safeParse(validHashArtifact);
    expect(validResult.success).toBe(true);
  });

  it("update status chỉ cho phép các trạng thái terminal hoặc valid state machine", () => {
    const validUpdate = {
      status: "completed",
      result_ref: "22222222-2222-4000-8000-000000000002",
    };
    expect(updateTaskStatusSchema.safeParse(validUpdate).success).toBe(true);

    const invalidUpdate = {
      status: "invalid_status_state",
    };
    expect(updateTaskStatusSchema.safeParse(invalidUpdate).success).toBe(false);
  });
});
