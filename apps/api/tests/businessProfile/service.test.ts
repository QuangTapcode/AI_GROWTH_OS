import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../src/lib/auth";

const { getProfile, updateProfile, resolveTenantContext } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  resolveTenantContext: vi.fn(),
}));

vi.mock("../../src/modules/businessProfile/repository", () => ({
  getProfile,
  updateProfile,
}));

vi.mock("../../src/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/tenant")>();
  return { ...actual, resolveTenantContext };
});

const user: AuthUser = {
  id: "a0000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  name: "Backend QA",
};
const workspaceId = "10000000-0000-4000-8000-000000000001";
const profile = {
  id: "p-1",
  workspace_id: workspaceId,
  company_name: "TripC",
  website_url: null,
  industry: "Travel",
  overview: null,
  safety_rules: null,
  target_locations: ["Da Nang"],
  target_audiences: [],
  products_services: [],
  brand_voice: null,
  brand_guidelines: null,
  competitors: [],
  research_strategy: null,
  version: 3,
  updated_by: user.id,
  updated_at: "2026-11-05T00:00:00.000Z",
};

describe("business profile service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenantContext.mockResolvedValue({ user, workspaceId, role: "owner" });
  });

  it("checks workspace membership before returning the profile", async () => {
    getProfile.mockResolvedValue(profile);
    const { getBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(getBusinessProfile(user, workspaceId)).resolves.toEqual(profile);
    expect(resolveTenantContext).toHaveBeenCalledWith(user, workspaceId);
    expect(getProfile).toHaveBeenCalledWith(workspaceId);
  });

  it("returns a not-found error when the workspace has no profile", async () => {
    getProfile.mockResolvedValue(null);
    const { getBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(getBusinessProfile(user, workspaceId)).rejects.toMatchObject({
      statusCode: 404,
      code: "PROFILE_NOT_FOUND",
    });
  });

  it("validates the update and sends normalized values and actor to the repository", async () => {
    updateProfile.mockResolvedValue({ kind: "updated", profile });
    const { updateBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(updateBusinessProfile(user, workspaceId, {
      expected_version: 3,
      company_name: "  TripC QA  ",
      target_locations: [" Da Nang ", "Hoi An"],
    })).resolves.toEqual(profile);

    expect(updateProfile).toHaveBeenCalledWith(workspaceId, {
      expected_version: 3,
      company_name: "TripC QA",
      target_locations: ["Da Nang", "Hoi An"],
    }, user.id);
  });

  it("rejects viewer edits before writing to the repository", async () => {
    resolveTenantContext.mockResolvedValue({ user, workspaceId, role: "viewer" });
    const { updateBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(updateBusinessProfile(user, workspaceId, {
      expected_version: 3,
      brand_voice: "Helpful",
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PERMISSION_DENIED",
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("returns field errors for an invalid payload without writing", async () => {
    const { updateBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(updateBusinessProfile(user, workspaceId, {
      expected_version: 0,
      company_name: " ",
      unexpected: true,
    })).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_FAILED",
      fieldErrors: expect.objectContaining({
        expected_version: expect.any(Array),
        company_name: expect.any(Array),
        "(root)": expect.any(Array),
      }),
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("maps a stale version into a conflict that includes the current version", async () => {
    updateProfile.mockResolvedValue({ kind: "conflict", currentVersion: 4 });
    const { updateBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(updateBusinessProfile(user, workspaceId, {
      expected_version: 3,
      brand_voice: "Helpful",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: expect.stringContaining("current version 4"),
    });
  });

  it("maps a missing profile during update to a not-found error", async () => {
    updateProfile.mockResolvedValue({ kind: "not_found" });
    const { updateBusinessProfile } = await import("../../src/modules/businessProfile/service");

    await expect(updateBusinessProfile(user, workspaceId, {
      expected_version: 3,
      brand_voice: "Helpful",
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "PROFILE_NOT_FOUND",
    });
  });
});
