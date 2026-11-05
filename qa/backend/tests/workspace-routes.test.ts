import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const workspace = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  getBusinessProfile: vi.fn(),
  updateBusinessProfile: vi.fn(),
  listWorkspaceLeadsApi: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/auth", () => ({
  authenticateUser: workspace.authenticateUser,
}));

vi.mock("../../../apps/api/src/modules/businessProfile/service", () => ({
  getBusinessProfile: workspace.getBusinessProfile,
  updateBusinessProfile: workspace.updateBusinessProfile,
}));

vi.mock("../../../apps/api/src/modules/leads/workspace", () => ({
  listWorkspaceLeadsApi: workspace.listWorkspaceLeadsApi,
}));

const user = { id: "user-1", email: "qa@example.test", name: "Backend QA" };
const workspaceId = "10000000-0000-4000-8000-000000000001";

describe("Backend workspace routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspace.authenticateUser.mockReturnValue(user);
  });

  it("returns a profile for the workspace in the URL", async () => {
    const profile = { id: "profile-1", workspace_id: workspaceId, company_name: "TripC", version: 1 };
    workspace.getBusinessProfile.mockResolvedValue(profile);
    const { GET } = await import("../../../apps/api/src/app/v1/workspaces/[workspace_id]/business-profile/route");
    const response = await GET(
      new Request(`http://localhost:4000/v1/workspaces/${workspaceId}/business-profile`) as never,
      { params: { workspace_id: workspaceId } },
    );

    expect(response.status).toBe(200);
    expect(workspace.getBusinessProfile).toHaveBeenCalledWith(user, workspaceId);
    await expect(response.json()).resolves.toEqual(profile);
  });

  it("forwards the profile update body to the service and returns the saved profile", async () => {
    const input = { expected_version: 2, brand_voice: "Helpful" };
    const saved = { id: "profile-1", workspace_id: workspaceId, version: 3, brand_voice: "Helpful" };
    workspace.updateBusinessProfile.mockResolvedValue(saved);
    const { PUT } = await import("../../../apps/api/src/app/v1/workspaces/[workspace_id]/business-profile/route");
    const response = await PUT(new Request(
      `http://localhost:4000/v1/workspaces/${workspaceId}/business-profile`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) },
    ) as never, { params: { workspace_id: workspaceId } });

    expect(response.status).toBe(200);
    expect(workspace.updateBusinessProfile).toHaveBeenCalledWith(user, workspaceId, input);
    await expect(response.json()).resolves.toEqual(saved);
  });

  it("maps service permission errors into the standard API error envelope", async () => {
    const { AppError } = await import("../../../apps/api/src/lib/errors");
    workspace.updateBusinessProfile.mockRejectedValue(new AppError(403, "PERMISSION_DENIED", "Viewer cannot edit"));
    const { PUT } = await import("../../../apps/api/src/app/v1/workspaces/[workspace_id]/business-profile/route");
    const response = await PUT(new Request(
      `http://localhost:4000/v1/workspaces/${workspaceId}/business-profile`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_version: 1 }) },
    ) as never, { params: { workspace_id: workspaceId } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED", request_id: expect.any(String) },
    });
  });

  it("authenticates lead list requests and forwards URL filters under the correct tenant", async () => {
    const leads = { items: [{ id: "lead-1", status: "new" }], total: 1 };
    workspace.listWorkspaceLeadsApi.mockResolvedValue(leads);
    const { GET } = await import("../../../apps/api/src/app/v1/workspaces/[workspace_id]/leads/route");
    const request = new NextRequest(
      `http://localhost:4000/v1/workspaces/${workspaceId}/leads?status=new&limit=10`,
      { headers: { authorization: "Bearer synthetic-token" } },
    );
    const response = await GET(request as never, { params: { workspace_id: workspaceId } });

    expect(response.status).toBe(200);
    expect(workspace.authenticateUser).toHaveBeenCalledWith(request);
    expect(workspace.listWorkspaceLeadsApi).toHaveBeenCalledWith(user, workspaceId, { status: "new", limit: "10" });
    await expect(response.json()).resolves.toEqual(leads);
  });
});
