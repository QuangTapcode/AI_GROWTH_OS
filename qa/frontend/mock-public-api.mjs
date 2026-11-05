import { createServer } from "node:http";

const port = 4317;
const sitePrefix = "/public/v1/sites/tripc-pilot";
const retryCounts = new Map();
const post = {
  title: "Frontend QA guide: a synthetic stay in Da Nang",
  slug: "frontend-qa-guide",
  body: [
    "## A practical guide",
    "This synthetic article is only used to verify the pilot frontend form.",
    "[source:frontend-qa](https://example.com/frontend-qa-source)",
    "[Request information](/contact) — Ask about a long stay",
  ].join("\n\n"),
  meta: { description: "Synthetic frontend QA guide.", locale: "en" },
  published_at: "2026-11-01T00:00:00.000Z",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (url.pathname === `${sitePrefix}/posts` && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ items: [] }));
    return;
  }
  if (url.pathname === `${sitePrefix}/posts/${post.slug}` && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ post }));
    return;
  }
  if (url.pathname === `${sitePrefix}/events` && request.method === "POST") {
    response.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: true }));
    return;
  }
  if (url.pathname === `${sitePrefix}/leads` && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const lead = JSON.parse(body);
    if (lead.email.startsWith("retry-")) {
      const attempts = (retryCounts.get(lead.email) ?? 0) + 1;
      retryCounts.set(lead.email, attempts);
      if (attempts === 1) {
        response.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Synthetic first-attempt failure." }));
        return;
      }
    }
    response.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: true }));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "127.0.0.1");
