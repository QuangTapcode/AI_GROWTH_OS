export type ApiHealth = {
  status: "ok";
  service: "ai-growth-os-api";
  environment: string;
  scope: "process_only";
  checked_at: string;
};

export async function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/v1").replace(/\/$/, "");
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(`${baseUrl}/health`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error("API is unavailable.");
  const body: unknown = await response.json();
  if (
    typeof body !== "object" || body === null ||
    !("status" in body) || body.status !== "ok" ||
    !("service" in body) || body.service !== "ai-growth-os-api" ||
    !("scope" in body) || body.scope !== "process_only" ||
    !("environment" in body) || typeof body.environment !== "string" ||
    !("checked_at" in body) || typeof body.checked_at !== "string"
  ) throw new Error("Unexpected API response.");
  return body as ApiHealth;
}

