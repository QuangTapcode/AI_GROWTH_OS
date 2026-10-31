import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { acceptLearningTasks } from "../../src/modules/campaignPlans/learningTasks";
import { PlanError } from "../../src/modules/campaignPlans/service";
import { canonicalJson, sha256Hex } from "../../src/lib/hash";

describe("Growth Lead: Closed-Loop Learning & Deduplicated Task Dispatch Suite", () => {
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const ownerId = "20000000-0000-4000-8000-000000000001";
  const editorId = "20000000-0000-4000-8000-000000000002";
  const snapshotId = "30000000-0000-4000-8000-000000000001";
  const sourceId = "40000000-0000-4000-8000-000000000001";

  const perfArtifactId = "50000000-0000-4000-8000-000000000001";
  const leadArtifactId = "50000000-0000-4000-8000-000000000002";
  const learningArtifactId = "50000000-0000-4000-8000-000000000003";

  // Mock Database State & Query Dispatcher
  let dbTables: {
    workspaces: any[];
    memberships: any[];
    business_profiles: any[];
    knowledge_contexts: any[];
    sources: any[];
    content_artifacts: any[];
    workflow_tasks: any[];
    plan_task_outbox: any[];
    approvals: any[];
  };

  let mockPool: Pool;
  let queriesExecuted: { sql: string; params: any[] }[];

  beforeEach(() => {
    queriesExecuted = [];
    dbTables = {
      workspaces: [{ id: workspaceId, name: "Growth OS Main" }],
      memberships: [
        { workspace_id: workspaceId, user_id: ownerId, role: "owner", status: "active" },
        { workspace_id: workspaceId, user_id: editorId, role: "editor", status: "active" },
      ],
      business_profiles: [{ workspace_id: workspaceId, version: 1 }],
      knowledge_contexts: [
        {
          snapshot_id: snapshotId,
          workspace_id: workspaceId,
          profile_version: 1,
          current: true,
          snapshot: {
            sources: [{ source_id: sourceId, version: 1 }],
          },
        },
      ],
      sources: [
        {
          id: sourceId,
          workspace_id: workspaceId,
          version: 1,
          status: "approved",
          deleted_at: null,
        },
      ],
      content_artifacts: [],
      workflow_tasks: [],
      plan_task_outbox: [],
      approvals: [],
    };

    mockPool = {
      connect: async () => {
        return {
          query: async (sql: string, params: any[] = []) => {
            queriesExecuted.push({ sql, params });
            const s = sql.trim();

            if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
              return { rows: [], rowCount: 0 };
            }

            if (s.includes("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")) {
              const row = dbTables.workspaces.find((w) => w.id === params[0]);
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active'")) {
              const row = dbTables.memberships.find(
                (m) => m.workspace_id === params[0] && m.user_id === params[1] && m.status === "active"
              );
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM content_artifacts WHERE workspace_id=$1 AND id=$2")) {
              const row = dbTables.content_artifacts.find(
                (a) => a.workspace_id === params[0] && a.id === params[1]
              );
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current")) {
              const row = dbTables.knowledge_contexts.find(
                (k) => k.workspace_id === params[0] && k.snapshot_id === params[1] && k.current
              );
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM business_profiles WHERE workspace_id=$1")) {
              const row = dbTables.business_profiles.find((p) => p.workspace_id === params[0]);
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM sources WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='approved' AND deleted_at IS NULL")) {
              const row = dbTables.sources.find(
                (src) =>
                  src.workspace_id === params[0] &&
                  src.id === params[1] &&
                  src.version === params[2] &&
                  src.status === "approved" &&
                  src.deleted_at === null
              );
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("FROM workflow_tasks WHERE workspace_id=$1 AND operation='research.run' AND payload->>'dedup_key'=$2")) {
              const row = dbTables.workflow_tasks.find(
                (t) => t.workspace_id === params[0] && t.operation === "research.run" && t.payload?.dedup_key === params[1]
              );
              return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
            }

            if (s.includes("INSERT INTO workflow_tasks")) {
              const taskRow = {
                id: params[0],
                workspace_id: params[1],
                role: "research",
                operation: "research.run",
                status: "queued",
                input_version: 1,
                context_snapshot_id: params[2],
                payload: typeof params[3] === "string" ? JSON.parse(params[3]) : params[3],
              };
              dbTables.workflow_tasks.push(taskRow);
              return { rows: [taskRow], rowCount: 1 };
            }

            if (s.includes("INSERT INTO plan_task_outbox")) {
              const outboxRow = {
                workspace_id: params[0],
                task_id: params[1],
                input_version: 1,
                operation: "research.run",
              };
              dbTables.plan_task_outbox.push(outboxRow);
              return { rows: [outboxRow], rowCount: 1 };
            }

            if (s.includes("UPDATE approvals SET status='approved'")) {
              const rows = dbTables.approvals.filter(
                (a) => a.workspace_id === params[0] && a.target_id === params[1] && a.target_version === params[2] &&
                  a.target_hash === params[3] && a.status === "pending"
              );
              for (const row of rows) Object.assign(row, { status: "approved", decision: "approve", actor_id: params[4], actor_role: "owner" });
              return { rows, rowCount: rows.length };
            }

            if (s.includes("UPDATE workflow_tasks SET status='completed'")) {
              const rows = dbTables.workflow_tasks.filter(
                (t) => t.workspace_id === params[0] && t.result_ref === params[1] && t.status === "awaiting_approval"
              );
              for (const row of rows) row.status = "completed";
              return { rows, rowCount: rows.length };
            }

            if (s.includes("INSERT INTO approvals")) {
              const appRow = {
                workspace_id: params[0],
                target_type: "artifact",
                target_id: params[1],
                target_version: params[2],
                target_hash: params[3],
                status: "approved",
                decision: "approve",
                actor_id: params[4],
                actor_role: "owner",
              };
              dbTables.approvals.push(appRow);
              return { rows: [appRow], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
          },
          release: () => {},
        };
      },
    } as unknown as Pool;
  });

  function setupStandardArtifacts(options: {
    iteration?: number;
    maxIterations?: number;
    synthetic?: boolean;
    missingFacts?: string[];
  } = {}) {
    const iteration = options.iteration ?? 0;
    const maxIterations = options.maxIterations ?? 3;
    const synthetic = options.synthetic ?? false;

    // 1. Upstream Performance Artifact
    const perfResult = {
      workspace_id: workspaceId,
      version: 1,
      synthetic,
      conversions: 12,
      ctr: 0.045,
    };
    const perfHash = sha256Hex(canonicalJson({ result: perfResult, evidence: [] }));
    const perfRef = {
      artifact_id: perfArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: perfHash,
      role: "performance",
      context_snapshot_id: snapshotId,
      storage: "ai_run_store",
    };
    dbTables.content_artifacts.push({
      id: perfArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: perfHash,
      context_snapshot_id: snapshotId,
      role: "performance",
      operation: "performance.report",
      payload: { artifact: perfRef, result: perfResult },
      evidence: [],
    });

    // 2. Upstream Lead Summary Aggregate Artifact (Privacy-safe: count only, NO PII)
    const leadResult = {
      workspace_id: workspaceId,
      version: 1,
      count: 85,
      synthetic,
    };
    const leadHash = sha256Hex(canonicalJson({ result: leadResult, evidence: [] }));
    const leadRef = {
      artifact_id: leadArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: leadHash,
      role: "lead_aggregate",
      context_snapshot_id: snapshotId,
      storage: "ai_run_store",
    };
    dbTables.content_artifacts.push({
      id: leadArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: leadHash,
      context_snapshot_id: snapshotId,
      role: "lead_aggregate",
      operation: "lead.aggregate",
      payload: { artifact: leadRef, result: leadResult },
      evidence: [],
    });

    // 3. Expected Next-Task Dedup Key
    const expectedDedupKey = createHash("sha256")
      .update(`${workspaceId}:${perfArtifactId}:1:${leadArtifactId}:1:${iteration}`)
      .digest("hex");

    // 4. Growth Lead Learning Artifact
    const nextTasks =
      iteration >= maxIterations
        ? []
        : [
            {
              role: "research",
              operation: "research.run",
              dedup_key: expectedDedupKey,
              iteration: iteration + 1,
              reason: "Reassess one grounded topic using the cited aggregate window.",
              input_artifact_refs: [perfRef, leadRef],
              requires_human_approval: true,
            },
          ];

    const learningResult = {
      workspace_id: workspaceId,
      context_snapshot_id: snapshotId,
      profile_version: 1,
      status: options.missingFacts?.length ? "insufficient_data" : "draft",
      missing_facts: options.missingFacts ?? [],
      iteration,
      max_iterations: maxIterations,
      synthetic,
      learning: ["Aggregate window indicates potential for local expat cluster expansion."],
      next_tasks: nextTasks,
      input_artifact_refs: [perfRef, leadRef],
      stopped_reason: iteration >= maxIterations ? "max_iterations" : null,
    };

    const learningHash = sha256Hex(canonicalJson({ result: learningResult, evidence: [] }));
    const learningRef = {
      artifact_id: learningArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: learningHash,
      role: "growth_lead" as const,
      context_snapshot_id: snapshotId,
      storage: "ai_run_store" as const,
    };

    dbTables.content_artifacts.push({
      id: learningArtifactId,
      workspace_id: workspaceId,
      version: 1,
      content_hash: learningHash,
      context_snapshot_id: snapshotId,
      role: "growth_lead",
      operation: "learning.analyze",
      payload: { artifact: learningRef, result: learningResult },
      evidence: [],
    });

    return { perfRef, leadRef, learningRef, expectedDedupKey };
  }

  it("Test 1: Phê duyệt thành công - Owner duyệt learning artifact -> Transactionally ghi nhận workflow task, outbox và approval", async () => {
    const { learningRef, expectedDedupKey } = setupStandardArtifacts({ iteration: 0 });

    const result = await acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true);

    expect(result.approval_required_for_outputs).toBe(true);
    expect(result.task_ids).toHaveLength(1);
    const taskId = result.task_ids[0];

    // Kiểm tra workflow_tasks
    expect(dbTables.workflow_tasks).toHaveLength(1);
    const task = dbTables.workflow_tasks[0];
    expect(task.id).toBe(taskId);
    expect(task.workspace_id).toBe(workspaceId);
    expect(task.role).toBe("research");
    expect(task.operation).toBe("research.run");
    expect(task.status).toBe("queued");
    expect(task.payload.dedup_key).toBe(expectedDedupKey);
    expect(task.payload.iteration).toBe(1);

    // Kiểm tra plan_task_outbox
    expect(dbTables.plan_task_outbox).toHaveLength(1);
    expect(dbTables.plan_task_outbox[0].task_id).toBe(taskId);
    expect(dbTables.plan_task_outbox[0].operation).toBe("research.run");

    // Kiểm tra approvals ledger
    expect(dbTables.approvals).toHaveLength(1);
    const approval = dbTables.approvals[0];
    expect(approval.target_type).toBe("artifact");
    expect(approval.target_id).toBe(learningRef.artifact_id);
    expect(approval.status).toBe("approved");
    expect(approval.decision).toBe("approve");
    expect(approval.actor_id).toBe(ownerId);
    expect(approval.actor_role).toBe("owner");
  });

  it("Test 1b: Duyệt từ Review Queue - quyết định approval pending sẵn có và hoàn tất task learning, không tạo approval thứ hai", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0 });
    // The worker stores the learning artifact with a pending review and an awaiting task.
    dbTables.approvals.push({
      workspace_id: workspaceId, target_type: "artifact", target_id: learningRef.artifact_id,
      target_version: learningRef.version, target_hash: learningRef.content_hash, status: "pending",
    });
    dbTables.workflow_tasks.push({
      id: randomUUID(), workspace_id: workspaceId, operation: "learning.analyze",
      status: "awaiting_approval", result_ref: learningRef.artifact_id, payload: {},
    });

    const result = await acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true);

    expect(result.task_ids).toHaveLength(1);
    expect(dbTables.approvals).toHaveLength(1);
    expect(dbTables.approvals[0]).toMatchObject({ status: "approved", decision: "approve", actor_id: ownerId, actor_role: "owner" });
    expect(dbTables.workflow_tasks.find((t) => t.operation === "learning.analyze")?.status).toBe("completed");
    expect(dbTables.workflow_tasks.find((t) => t.operation === "research.run")?.status).toBe("queued");
  });

  it("Test 2: Idempotent Dedup - Gửi lại request với cùng dedup_key -> tái sử dụng task đã tạo, không tạo task duplicate", async () => {
    const { learningRef, expectedDedupKey } = setupStandardArtifacts({ iteration: 0 });

    // Lần 1: Chấp nhận và tạo mới task
    const result1 = await acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true);
    expect(result1.task_ids).toHaveLength(1);
    const initialTaskId = result1.task_ids[0];
    expect(dbTables.workflow_tasks).toHaveLength(1);

    // Lần 2: Chấp nhận lại cùng learning artifact & dedup_key
    const result2 = await acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true);
    expect(result2.task_ids).toHaveLength(1);
    expect(result2.task_ids[0]).toBe(initialTaskId);

    // Không sinh thêm bản ghi dư thừa trong workflow_tasks
    expect(dbTables.workflow_tasks).toHaveLength(1);
  });

  it("Test 3: Runaway Loop Protection - Chặn đứng khi iteration >= max_iterations hoặc max_iterations > 3", async () => {
    // 3a. max_iterations vượt trần cho phép (> 3)
    const { learningRef: invalidMaxRef } = setupStandardArtifacts({ iteration: 0, maxIterations: 4 });

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, invalidMaxRef, true)).rejects.toThrow(
      "Learning requires complete aggregate inputs and bounded iterations/quota"
    );

    // 3b. iteration đã chạm max_iterations (vòng lặp đã hoàn thành hạn mức)
    dbTables.content_artifacts = [];
    const { learningRef: reachedLimitRef } = setupStandardArtifacts({ iteration: 3, maxIterations: 3 });
    // Nếu tiếp tục cố gắng dispatch next_tasks khi iteration >= max_iterations -> reject
    const learningArt = dbTables.content_artifacts.find((a) => a.id === learningArtifactId);
    learningArt.payload.result.next_tasks = [
      {
        role: "research",
        operation: "research.run",
        dedup_key: "dummy-key",
        iteration: 4,
        requires_human_approval: true,
        input_artifact_refs: learningArt.payload.result.input_artifact_refs,
      },
    ];
    // Recompute hash
    learningArt.content_hash = sha256Hex(canonicalJson({ result: learningArt.payload.result, evidence: [] }));
    reachedLimitRef.content_hash = learningArt.content_hash;
    learningArt.payload.artifact = reachedLimitRef;

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, reachedLimitRef, true)).rejects.toThrow(
      "Invalid role, quota, iteration, input refs or dedup key"
    );
  });

  it("Test 4: RBAC & Permission - Chỉ active owner mới được duyệt, Editor/Viewer bị từ chối 403", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0 });

    try {
      await acceptLearningTasks(mockPool, workspaceId, editorId, learningRef, true);
      expect.fail("Cần phải ném lỗi 403 PERMISSION_DENIED");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlanError);
      expect(err.code).toBe("PERMISSION_DENIED");
      expect(err.status).toBe(403);
      expect(err.message).toContain("An active owner must approve learning tasks");
    }
  });

  it("Test 5: Privacy & Input Validation - Chặn nếu input_artifact_refs thiếu role performance hoặc lead aggregate", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0 });
    const learningArt = dbTables.content_artifacts.find((a) => a.id === learningArtifactId);

    // Xóa bớt upstream ref chỉ còn 1
    learningArt.payload.result.input_artifact_refs = [learningArt.payload.result.input_artifact_refs[0]];
    learningArt.content_hash = sha256Hex(canonicalJson({ result: learningArt.payload.result, evidence: [] }));
    learningRef.content_hash = learningArt.content_hash;
    learningArt.payload.artifact = learningRef;

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true)).rejects.toThrow(
      "Performance and lead aggregate references required"
    );
  });

  it("Test 6: Hash Integrity - Nội dung artifact bị can thiệp (hash mismatch) -> bị từ chối với ARTIFACT_MISMATCH", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0 });
    const learningArt = dbTables.content_artifacts.find((a) => a.id === learningArtifactId);

    // Giả mạo nội dung kết quả nhưng giữ nguyên content_hash của ref
    learningArt.payload.result.learning = ["TAMPERED CONTENT"];

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true)).rejects.toThrow(
      "Learning artifact is absent, stale or corrupt"
    );
  });

  it("Test 7: Context Staleness & Source Revocation - Ngữ cảnh cũ hoặc nguồn tri thức chưa duyệt bị từ chối", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0 });

    // Thu hồi nguồn tri thức (status != 'approved')
    dbTables.sources[0].status = "revoked";

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, true)).rejects.toThrow(
      "Rebuild learning after source changes"
    );
  });

  it("Test 8: Synthetic Guard - Mock learning bị từ chối khi không bật chế độ sandbox (allowSynthetic = false)", async () => {
    const { learningRef } = setupStandardArtifacts({ iteration: 0, synthetic: true });

    await expect(acceptLearningTasks(mockPool, workspaceId, ownerId, learningRef, false)).rejects.toThrow(
      "Mock learning requires explicit sandbox mode"
    );
  });
});
