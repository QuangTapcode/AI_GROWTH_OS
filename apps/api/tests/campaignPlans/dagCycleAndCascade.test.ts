import { describe, it, expect, vi } from "vitest";
import { validateTaskGraph, propagateUpstreamTaskFailure } from "../../src/modules/tasks/dag";
import { MockPlanRepository } from "../../src/modules/campaignPlans/mockRepository";
import { PlanError } from "../../src/modules/campaignPlans/service";
import type { CampaignPlan } from "../../src/modules/campaignPlans/schemas";

describe("DAG Validation & Cascade Failure Suite (Growth Lead & Task Ledger)", () => {
  describe("1. validateTaskGraph: Cycle Detection Algorithm", () => {
    it("chấp nhận đồ thị tuyến tính hợp lệ (A -> B -> C)", () => {
      const tasks = [
        { id: "task-1", dependencies: [] },
        { id: "task-2", dependencies: ["task-1"] },
        { id: "task-3", dependencies: ["task-2"] },
      ];
      const result = validateTaskGraph(tasks);
      expect(result.valid).toBe(true);
      expect(result.cycle).toBeUndefined();
    });

    it("chấp nhận đồ thị hình kim cương (Diamond DAG) không có chu trình", () => {
      const tasks = [
        { id: "root", dependencies: [] },
        { id: "branch-a", dependencies: ["root"] },
        { id: "branch-b", dependencies: ["root"] },
        { id: "merge", dependencies: ["branch-a", "branch-b"] },
      ];
      const result = validateTaskGraph(tasks);
      expect(result.valid).toBe(true);
    });

    it("chặn đứng self-dependency (task tự phụ thuộc chính nó)", () => {
      const tasks = [
        { id: "task-1", dependencies: ["task-1"] },
      ];
      const result = validateTaskGraph(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Self-dependency detected");
      expect(result.cycle).toEqual(["task-1", "task-1"]);
    });

    it("chặn đứng chu trình trực tiếp 2 node (A phụ thuộc B và B phụ thuộc A)", () => {
      const tasks = [
        { id: "task-a", dependencies: ["task-b"] },
        { id: "task-b", dependencies: ["task-a"] },
      ];
      const result = validateTaskGraph(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Circular dependency detected");
      expect(result.cycle).toBeDefined();
      expect(result.cycle?.length).toBeGreaterThanOrEqual(3);
    });

    it("chặn đứng chu trình gián tiếp 3 node (A -> B -> C -> A)", () => {
      const tasks = [
        { id: "node-a", dependencies: ["node-c"] },
        { id: "node-b", dependencies: ["node-a"] },
        { id: "node-c", dependencies: ["node-b"] },
      ];
      const result = validateTaskGraph(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Circular dependency detected");
    });
  });

  describe("2. Plan Repository: Chặn Campaign Plan có Circular Dependency", () => {
    it("MockPlanRepository.accept từ chối plan có tasks phụ thuộc vòng lặp (422 CYCLIC_DEPENDENCY)", async () => {
      const repo = new MockPlanRepository();
      const workspaceId = "10000000-0000-4000-8000-000000000001";
      const dummyContext = {
        snapshot_id: "20000000-0000-4000-8000-000000000001",
        profile_version: 1,
        approved_sources: [],
      };
      repo.seedContext(workspaceId, dummyContext);

      // Tạo một dummy plan chứa 2 task có chu trình: task-1 phụ thuộc task-2, task-2 phụ thuộc task-1
      const cyclicPlan = {
        contract_version: "growth-lead-plan-v2",
        plan_id: "30000000-0000-4000-8000-000000000001",
        workspace_id: workspaceId,
        input_version: 1,
        profile_version: 1,
        context_snapshot_id: dummyContext.snapshot_id,
        status: "proposed",
        objective: "Test cyclic plan rejection",
        selection_method: "model_selection_from_grounded_research",
        research_artifact: {
          artifact_id: "40000000-0000-4000-8000-000000000001",
          workspace_id: workspaceId,
          version: 1,
          content_hash: "a".repeat(64),
          role: "research",
          storage: "ai_run_store",
        },
        tasks: [
          {
            task_id: "50000000-0000-4000-8000-000000000001",
            role: "seo",
            operation: "seo.local_draft",
            tools: ["knowledge.read", "content.draft"],
            depends_on: ["50000000-0000-4000-8000-000000000002"], // depends on task-2
            input_artifact_refs: [],
            dependency_artifact_from: [],
            brief: {
              topic: "Test topic",
              audience: ["tech expats"],
              offer: ["guide"],
              audience_fit: "fit",
              offer_fit: "fit",
              deliverable: "seo_article_draft",
              cta: "Join now",
              acceptance: [],
            },
            requires_human_approval: true,
          },
          {
            task_id: "50000000-0000-4000-8000-000000000002",
            role: "content",
            operation: "content.repurpose",
            tools: ["knowledge.read", "content.draft"],
            depends_on: ["50000000-0000-4000-8000-000000000001"], // depends on task-1 (CHU TRÌNH!)
            input_artifact_refs: [],
            dependency_artifact_from: [],
            brief: {
              topic: "Test topic",
              audience: ["tech expats"],
              offer: ["guide"],
              audience_fit: "fit",
              offer_fit: "fit",
              deliverable: "social_pack_draft",
              cta: "Join now",
              acceptance: [],
            },
            requires_human_approval: true,
          },
        ],
        missing_facts: [],
        requires_human_approval: true,
        applied: false,
        synthetic: false,
      } as unknown as CampaignPlan;

      await expect(repo.accept(cyclicPlan, dummyContext)).rejects.toThrow(PlanError);
      await expect(repo.accept(cyclicPlan, dummyContext)).rejects.toMatchObject({
        code: "CYCLIC_DEPENDENCY",
        status: 422,
      });
    });
  });

  describe("3. Cascade Failure: Lan truyền hủy task con khi task cha thất bại", () => {
    it("propagateUpstreamTaskFailure cập nhật trạng thái 'cancelled' và outbox 'failed' cho các task con", async () => {
      const mockWorkspaceId = "10000000-0000-4000-8000-000000000001";
      const failedTaskId = "parent-task-1";

      const executedQueries: Array<{ sql: string; params: any[] }> = [];
      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes("WITH RECURSIVE downstream")) {
            // Giả lập trả về 2 task con downstream bị ảnh hưởng
            return {
              rows: [{ id: "child-task-seo" }, { id: "child-task-social" }],
              rowCount: 2,
            };
          }
          if (sql.includes("UPDATE plan_task_outbox")) {
            return { rowCount: 2 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      const cancelled = await propagateUpstreamTaskFailure(
        mockClient,
        mockWorkspaceId,
        failedTaskId,
        "failed"
      );

      expect(cancelled).toEqual(["child-task-seo", "child-task-social"]);
      expect(mockClient.query).toHaveBeenCalledTimes(2);

      // Query 1: Cascade cancel các task con downstream trong workflow_tasks
      const q1 = executedQueries[0];
      expect(q1.sql).toContain("WITH RECURSIVE downstream");
      expect(q1.sql).toContain("status = 'cancelled'");
      expect(q1.sql).toContain("UPSTREAM_TASK_FAILED");
      expect(q1.params).toEqual([failedTaskId, mockWorkspaceId, "failed"]);

      // Query 2: Hủy outbox để worker không lấy các task này
      const q2 = executedQueries[1];
      expect(q2.sql).toContain("UPDATE plan_task_outbox");
      expect(q2.sql).toContain("status = 'failed'");
      expect(q2.sql).toContain("UPSTREAM_TASK_FAILED");
      expect(q2.params[0]).toBe(mockWorkspaceId);
      expect(q2.params[1]).toEqual(["child-task-seo", "child-task-social"]);
    });

    it("không thực hiện update outbox nếu không có task con downstream nào bị ảnh hưởng", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      };

      const cancelled = await propagateUpstreamTaskFailure(
        mockClient,
        "ws-1",
        "leaf-task",
        "cancelled"
      );

      expect(cancelled).toEqual([]);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });
  });
});
