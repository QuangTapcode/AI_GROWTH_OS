import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Backend health routes", () => {
  it("returns process health with no-store and the configured allowed origin", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://qa.example.test");
    const { GET } = await import("../../../apps/api/src/app/v1/health/route");
    const response = await GET(new Request("http://localhost:4000/v1/health", {
      headers: { origin: "https://qa.example.test" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://qa.example.test");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "ai-growth-os-api",
      environment: "test",
      scope: "process_only",
      checked_at: expect.any(String),
    });
  });

  it("rejects an origin that is not configured", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://qa.example.test");
    const { GET } = await import("../../../apps/api/src/app/v1/health/route");
    const response = await GET(new Request("http://localhost:4000/v1/health", {
      headers: { origin: "https://untrusted.example.test" },
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED", request_id: expect.any(String) },
    });
  });

  it("answers allowed preflight requests without a response body", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://qa.example.test");
    const { OPTIONS } = await import("../../../apps/api/src/app/v1/health/route");
    const response = await OPTIONS(new Request("http://localhost:4000/v1/health", {
      method: "OPTIONS",
      headers: { origin: "https://qa.example.test" },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(await response.text()).toBe("");
  });
});
