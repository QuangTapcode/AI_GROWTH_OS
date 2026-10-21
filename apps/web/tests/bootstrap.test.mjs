import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

test("web starts at login page and serves process health", async () => {
  const rootRedirect = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(rootRedirect.status, 307);
  assert.equal(rootRedirect.headers.get("location"), "/login");

  const page = await fetch(baseUrl, { redirect: "follow" });
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /AI Growth OS/);
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "ai-growth-os-web",
    scope: "process_only",
  });
});
