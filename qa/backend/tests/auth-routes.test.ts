import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  authenticateUser: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("../../../apps/api/src/modules/auth/service", () => ({
  login: auth.login,
  getCurrentUser: auth.getCurrentUser,
}));

vi.mock("../../../apps/api/src/lib/auth", () => ({
  authenticateUser: auth.authenticateUser,
}));

describe("Backend authentication routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes login credentials and client metadata to the auth service", async () => {
    auth.login.mockResolvedValue({
      access_token: "synthetic-token",
      token_type: "Bearer",
      expires_at: "2026-11-06T00:00:00.000Z",
      user: { id: "user-1", email: "qa@example.test", full_name: "Backend QA", avatar_url: null },
    });
    const { POST } = await import("../../../apps/api/src/app/v1/auth/login/route");
    const request = new Request("http://localhost:4000/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "backend-qa-test",
        "x-forwarded-for": "203.0.113.20, 10.0.0.2",
      },
      body: JSON.stringify({ email: "qa@example.test", password: "synthetic-password" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(auth.login).toHaveBeenCalledWith(
      { email: "qa@example.test", password: "synthetic-password" },
      { ip: "203.0.113.20", userAgent: "backend-qa-test" },
    );
    await expect(response.json()).resolves.toMatchObject({ access_token: "synthetic-token" });
  });

  it("converts malformed login JSON into a validation response", async () => {
    const { AppError } = await import("../../../apps/api/src/lib/errors");
    auth.login.mockRejectedValue(new AppError(422, "VALIDATION_FAILED", "Invalid login payload", {
      email: ["Invalid email"],
    }));
    const { POST } = await import("../../../apps/api/src/app/v1/auth/login/route");
    const response = await POST(new Request("http://localhost:4000/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json",
    }) as never);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        request_id: expect.any(String),
        field_errors: { email: ["Invalid email"] },
      },
    });
    expect(auth.login).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it("authenticates /me and returns a non-cacheable user response", async () => {
    const user = { id: "user-1", email: "qa@example.test", name: "Backend QA" };
    auth.authenticateUser.mockReturnValue(user);
    auth.getCurrentUser.mockResolvedValue({
      user: { id: user.id, email: user.email, full_name: user.name, avatar_url: null },
      workspaces: [],
    });
    const { GET } = await import("../../../apps/api/src/app/v1/auth/me/route");
    const request = new Request("http://localhost:4000/v1/auth/me", {
      headers: { authorization: "Bearer synthetic-token" },
    });

    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(auth.authenticateUser).toHaveBeenCalledWith(request);
    expect(auth.getCurrentUser).toHaveBeenCalledWith(user);
    await expect(response.json()).resolves.toMatchObject({ user: { id: "user-1" }, workspaces: [] });
  });

  it("returns a standard unauthorized response when /me authentication fails", async () => {
    const { AppError } = await import("../../../apps/api/src/lib/errors");
    auth.authenticateUser.mockImplementation(() => {
      throw new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
    });
    const { GET } = await import("../../../apps/api/src/app/v1/auth/me/route");
    const response = await GET(new Request("http://localhost:4000/v1/auth/me") as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED", request_id: expect.any(String) },
    });
    expect(auth.getCurrentUser).not.toHaveBeenCalled();
  });
});
