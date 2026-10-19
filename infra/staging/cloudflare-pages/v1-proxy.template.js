// Pages Function: proxy /v1/* của aigrowthos-staging.pages.dev tới API (qua Cloudflare Tunnel).
// deploy.ps1 thay __API_ORIGIN__ và ghi file này thành functions/v1/[[path]].js lúc build.
// Same-origin nên trình duyệt không cần CORS; header Origin được bỏ trước khi chuyển tiếp.
const API_ORIGIN = "__API_ORIGIN__";
const DROP_REQUEST_HEADERS = ["host", "origin", "referer", "cookie", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"];

function apiUnavailable(status) {
  return new Response(
    JSON.stringify({
      error: {
        code: "API_UNREACHABLE",
        message: "The staging API host is offline. Try again later.",
        request_id: crypto.randomUUID(),
        upstream_status: status,
      },
    }),
    { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, API_ORIGIN);

  const headers = new Headers(request.headers);
  for (const name of DROP_REQUEST_HEADERS) headers.delete(name);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return apiUnavailable(0);
  }

  // Tunnel/host offline: Cloudflare trả trang lỗi HTML (502/530/1033) thay vì JSON của API
  const isJson = (upstream.headers.get("content-type") || "").includes("application/json");
  if (upstream.status >= 500 && !isJson) return apiUnavailable(upstream.status);

  const response = new Response(upstream.body, upstream);
  response.headers.delete("access-control-allow-origin");
  response.headers.delete("vary");
  if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
  return response;
}
