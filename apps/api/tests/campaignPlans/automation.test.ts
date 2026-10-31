import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import {
  automationTaskId,
  tickAutomation,
} from "../../src/modules/campaignPlans/automation";

describe("automation scheduler boundaries", () => {
  it("replays the same logical trigger with the same valid UUID", () => {
    expect(automationTaskId("research:tenant:slot")).toMatch(
      /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-a[a-f\d]{3}-[a-f\d]{12}$/,
    );
    expect(automationTaskId("research:tenant:slot")).toBe(
      automationTaskId("research:tenant:slot"),
    );
    expect(automationTaskId("research:other:slot")).not.toBe(
      automationTaskId("research:tenant:slot"),
    );
  });
  it("does not dispatch when another scheduler owns the workspace", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ acquired: false }] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }), query: vi.fn() };
    expect(await tickAutomation(pool as unknown as Pool, "workspace")).toEqual({
      skipped: "busy",
    });
    expect(pool.query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
  it("disabled workspaces never enqueue and always release their advisory lock", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ acquired: true }] });
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
      query: vi.fn().mockResolvedValue({ rows: [{ enabled: false }] }),
    };
    expect(await tickAutomation(pool as unknown as Pool, "workspace")).toEqual({
      skipped: "disabled",
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0]).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledOnce();
  });
  it("revoked owner stops dispatch and records the blocker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ acquired: true }] });
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ enabled: true, actor_id: "former-owner" }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValue({ rows: [] }),
    };
    await expect(
      tickAutomation(pool as unknown as Pool, "workspace"),
    ).rejects.toThrow("owner is no longer active");
    expect(pool.query.mock.calls[2][0]).toContain("last_error");
    expect(release).toHaveBeenCalledOnce();
  });
  it("only work in the current knowledge context can hold back the schedule", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ acquired: true }] });
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = {
      connect: async () => ({ query, release: vi.fn() }),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM agent_automation WHERE")) return { rows: [{ enabled: true, actor_id: "owner", next_run_at: new Date(0), interval_hours: 24 }] };
        if (sql.includes("FROM memberships")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("FROM knowledge_contexts")) return { rows: [{ snapshot_id: "ctx-current", snapshot: { sources: [{}] } }] };
        // An outstanding automation task in the current context: no new research is opened.
        if (sql.includes("agent_automation_handoffs h ON")) return { rowCount: 1, rows: [{}] };
        return { rowCount: 0, rows: [] };
      }),
    };
    await tickAutomation(pool as unknown as Pool, "workspace");
    const blockers = calls.filter((c) => c.sql.includes("status IN ('queued','running','pending','awaiting_approval')") && c.sql.includes("LIMIT 1"));
    expect(blockers).toHaveLength(2);
    for (const blocker of blockers) {
      expect(blocker.sql).toContain("t.context_snapshot_id=$2");
      expect(blocker.params).toEqual(["workspace", "ctx-current"]);
    }
  });
});
