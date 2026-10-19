import { describe, it, expect, beforeAll } from "vitest";

/**
 * Integration test trên Postgres THẬT đã `db:migrate` + `db:seed` (dùng DB riêng, không dùng DB chung).
 * Chạy: RUN_DB_TESTS=1 DATABASE_URL=postgres://.../ai_growth_os_check npx vitest run tests/integration
 * Mặc định bỏ qua để bộ test in-memory không cần DB. Test ghi dữ liệu nên chạy trên DB vừa seed.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC = "10000000-0000-4000-8000-000000000001";
const OWNER = { id: "a0000000-0000-4000-8000-000000000001", email: "owner.tripc.demo@gmail.com", name: "Linh Tran" };
const VIEWER = { id: "a0000000-0000-4000-8000-000000000003", email: "viewer.tripc.demo@gmail.com", name: "Hoa Pham" };
const APPROVED_ARTIFACT = "d0000000-0000-4000-8000-000000000002"; // approved trong seed
const PENDING_ARTIFACT = "d0000000-0000-4000-8000-000000000004"; // approval pending trong seed
const OTHER_TENANT_ARTIFACT = "d0000000-0000-4000-8000-000000000006";
const FAILED_TASK = "b0000000-0000-4000-8000-000000000007";

describe.skipIf(!RUN)("Live DB: sessions, distribution, profile, metrics, retry", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "integration_secret_value_long_enough_for_hs256";
  });

  it("logout thu hồi phiên: request sau đó bị 401 SESSION_REVOKED", async () => {
    const auth = await import("../../src/modules/auth/repository");
    const { resolveTenantContext, assertActiveSession } = await import("../../src/lib/tenant");
    const { logout } = await import("../../src/modules/auth/service");
    const sid = await auth.createSession(OWNER.id, new Date(Date.now() + 3600_000), { ip: "127.0.0.1", userAgent: "vitest" });
    const user = { ...OWNER, sessionId: sid };
    await expect(resolveTenantContext(user, TRIPC)).resolves.toMatchObject({ role: "owner" });
    await logout(user);
    await expect(resolveTenantContext(user, TRIPC)).rejects.toMatchObject({ statusCode: 401, code: "SESSION_REVOKED" });
    await expect(assertActiveSession(user)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    // Phiên của user khác không dùng được cho user này
    const foreign = await auth.createSession(VIEWER.id, new Date(Date.now() + 3600_000), { ip: "127.0.0.1", userAgent: null });
    await expect(resolveTenantContext({ ...OWNER, sessionId: foreign }, TRIPC)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  });

  it("chỉ xếp lịch được artifact đã duyệt đúng version; viewer không được xếp lịch", async () => {
    const svc = await import("../../src/modules/distribution/service");
    const channel = await svc.createWorkspaceChannel(OWNER, TRIPC, {
      platform_name: "facebook",
      display_name: `Test page ${Date.now()}`,
    });
    expect(channel.publish_mode).toBe("manual");

    await expect(
      svc.schedulePublishing(OWNER, TRIPC, { artifact_id: PENDING_ARTIFACT, channel_id: channel.id })
    ).rejects.toMatchObject({ statusCode: 409, code: "APPROVAL_REQUIRED" });
    await expect(
      svc.schedulePublishing(VIEWER, TRIPC, { artifact_id: APPROVED_ARTIFACT, channel_id: channel.id })
    ).rejects.toMatchObject({ statusCode: 403 });

    const job = await svc.schedulePublishing(OWNER, TRIPC, {
      artifact_id: APPROVED_ARTIFACT,
      channel_id: channel.id,
      utm_campaign: "cv-seo-q4",
    });
    expect(job).toMatchObject({ status: "scheduled", mode: "manual", platform_name: "facebook" });
    expect(job.utm_url).toContain("utm_campaign=cv-seo-q4");

    await expect(
      svc.schedulePublishing(OWNER, TRIPC, { artifact_id: APPROVED_ARTIFACT, channel_id: channel.id })
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_SCHEDULED" });

    const published = await svc.updatePublishingJob(OWNER, TRIPC, job.id, { action: "mark_published", external_post_id: "fb_123" });
    expect(published).toMatchObject({ status: "published", external_post_id: "fb_123" });
    await expect(svc.updatePublishingJob(OWNER, TRIPC, job.id, { action: "cancel" })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("artifact của tenant khác không xếp lịch được (cross-tenant)", async () => {
    const svc = await import("../../src/modules/distribution/service");
    const channel = await svc.createWorkspaceChannel(OWNER, TRIPC, { platform_name: "website", display_name: `Site ${Date.now()}` });
    await expect(
      svc.schedulePublishing(OWNER, TRIPC, { artifact_id: OTHER_TENANT_ARTIFACT, channel_id: channel.id })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("business profile: OCC theo version, viewer chỉ đọc", async () => {
    const svc = await import("../../src/modules/businessProfile/service");
    const profile = await svc.getBusinessProfile(VIEWER, TRIPC);
    await expect(
      svc.updateBusinessProfile(VIEWER, TRIPC, { expected_version: profile.version, brand_voice: "x" })
    ).rejects.toMatchObject({ statusCode: 403 });

    const updated = await svc.updateBusinessProfile(OWNER, TRIPC, {
      expected_version: profile.version,
      brand_voice: "helpful, local expert",
      target_locations: ["Da Nang", "Hoi An"],
    });
    expect(updated.version).toBe(profile.version + 1);
    expect(updated.target_locations).toEqual(["Da Nang", "Hoi An"]);

    await expect(
      svc.updateBusinessProfile(OWNER, TRIPC, { expected_version: profile.version, brand_voice: "stale write" })
    ).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
  });

  it("metrics: không có dữ liệu → missing + lý do; ghi snapshot → series và report có số liệu", async () => {
    const metrics = await import("../../src/modules/metrics/service");
    const { getWorkspaceReport } = await import("../../src/modules/reports/service");
    const empty = await metrics.getMetricSeries(OWNER, TRIPC, { metric: "sessions", from: "2026-01-01", to: "2026-01-02" });
    expect(empty).toMatchObject({ availability: "missing", missing_reason: "GOOGLE_CREDENTIALS_NOT_CONFIGURED", points: [] });

    await metrics.recordMetricSnapshotForWorkspace(OWNER, TRIPC, { provider: "ga4", metric_name: "sessions", date: "2026-01-01", value: 120 });
    const series = await metrics.getMetricSeries(OWNER, TRIPC, { metric: "sessions", from: "2026-01-01", to: "2026-01-02" });
    expect(series.points).toEqual([expect.objectContaining({ date: "2026-01-01", value: 120 })]);

    const report = await getWorkspaceReport(TRIPC, { from: "2026-01-01", to: "2026-01-02" } as never);
    expect(report.kpis.sessions).toMatchObject({ value: 120, availability: "partial", missing_reason: "SYNC_NOT_RUN_YET" });

    await expect(
      metrics.recordMetricSnapshotForWorkspace(OWNER, TRIPC, { provider: "gsc", metric_name: "sessions", date: "2026-01-02", value: 1 })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      metrics.recordMetricSnapshotForWorkspace(VIEWER, TRIPC, { provider: "ga4", metric_name: "sessions", date: "2026-01-02", value: 1 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("retry: chỉ task failed được đưa về queued, lần hai bị 409", async () => {
    const tasks = await import("../../src/modules/tasks/service");
    const retried = await tasks.retryWorkspaceTask(OWNER, TRIPC, FAILED_TASK);
    expect(retried).toMatchObject({ status: "queued", error_details: null });
    await expect(tasks.retryWorkspaceTask(OWNER, TRIPC, FAILED_TASK)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_STATE_TRANSITION",
    });
  });
});
