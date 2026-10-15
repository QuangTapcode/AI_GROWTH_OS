import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:4000";

test("health endpoints expose process liveness without claiming dependency readiness", async () => {
  for (const path of ["/health", "/v1/health"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "ai-growth-os-api");
    assert.equal(body.scope, "process_only");
    assert.ok(Number.isFinite(Date.parse(body.checked_at)));
    assert.equal("database_url" in body, false);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("both local frontends can call the API, including CORS preflight", async () => {
  for (const origin of ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]) {
    const response = await fetch(`${baseUrl}/v1/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    const preflight = await fetch(`${baseUrl}/v1/health`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  }
});

test("unapproved origins are rejected and receive no CORS permission", async () => {
  for (const method of ["GET", "OPTIONS"]) {
    const response = await fetch(`${baseUrl}/v1/health`, {
      method,
      headers: { Origin: "https://example.com" },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const body = await response.json();
    assert.equal(body.error.code, "ORIGIN_NOT_ALLOWED");
    assert.equal(typeof body.error.request_id, "string");
  }
});

