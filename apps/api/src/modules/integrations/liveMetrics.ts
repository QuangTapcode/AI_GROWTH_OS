import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AppError } from "@/lib/errors";
import { withTransaction } from "@/lib/db";
import { upsertConnection } from "@/modules/integrations/repository";

type Provider = "ga4" | "gsc" | "meta_ads";

export type LiveMetricPoint = {
  provider: Provider;
  metric_name: "sessions" | "pageviews" | "search_clicks" | "search_impressions" | "ad_spend";
  date: string;
  value: number;
  currency?: string;
  metadata: Record<string, unknown>;
};

export type LiveSyncResult = {
  provider: Provider;
  status: "synced" | "no_data" | "skipped" | "error";
  points: number;
  missing_reason?: string;
  error?: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DEFAULT_TIMEOUT_MS = 20_000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function config(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(422, "VALIDATION_FAILED", `${field} must be YYYY-MM-DD`);
  }
}

function dateRange(from: string, to: string) {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (from > to) throw new AppError(422, "VALIDATION_FAILED", "from must be on or before to");
  return { from, to };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function readServiceAccount(envName: string): Promise<ServiceAccount> {
  const raw = config(envName);
  if (!raw) throw new AppError(422, "INTEGRATION_NOT_CONFIGURED", `${envName} is not configured`);
  const source = raw.startsWith("@") ? await readFile(raw.slice(1), "utf8") : raw;
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(source) as Partial<ServiceAccount>;
  } catch {
    throw new AppError(500, "INTEGRATION_CONFIG_INVALID", `${envName} must contain valid service-account JSON`);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new AppError(500, "INTEGRATION_CONFIG_INVALID", `${envName} is missing client_email or private_key`);
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n"), token_uri: parsed.token_uri };
}

async function jsonRequest<T>(url: string, init: RequestInit, provider: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(config("INTEGRATION_REQUEST_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS)) });
  } catch {
    throw new AppError(502, "INTEGRATION_UNREACHABLE", `${provider} API could not be reached`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === "object" && "error" in body
      ? String((body as { error?: unknown }).error)
      : `HTTP_${response.status}`;
    throw new AppError(502, "INTEGRATION_REQUEST_FAILED", `${provider} API request failed (${code})`);
  }
  return body as T;
}

async function googleAccessToken(scopes: string[], envName = "GOOGLE_SERVICE_ACCOUNT_JSON"): Promise<string> {
  const account = await readServiceAccount(envName);
  const cacheKey = `${envName}:${account.client_email}:${scopes.join(" ")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: scopes.join(" "),
    aud: account.token_uri || GOOGLE_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const assertion = `${header}.${payload}.${base64Url(signer.sign(account.private_key))}`;
  const tokenResponse = await jsonRequest<{ access_token?: string; expires_in?: number }>(
    account.token_uri || GOOGLE_TOKEN_URI,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    },
    "Google OAuth",
  );
  if (!tokenResponse.access_token) throw new AppError(502, "GOOGLE_TOKEN_INVALID", "Google OAuth did not return an access token");
  tokenCache.set(cacheKey, { token: tokenResponse.access_token, expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000 });
  return tokenResponse.access_token;
}

function toIsoDate(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

type Ga4Response = { rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> };

async function fetchGa4(from: string, to: string): Promise<LiveMetricPoint[]> {
  const property = config("GA4_PROPERTY_ID");
  if (!property) throw new AppError(422, "INTEGRATION_NOT_CONFIGURED", "GA4_PROPERTY_ID is not configured");
  const token = await googleAccessToken(["https://www.googleapis.com/auth/analytics.readonly"]);
  const id = property.replace(/^properties\//, "");
  const response = await jsonRequest<Ga4Response>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(id)}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
        limit: "10000",
      }),
    },
    "GA4",
  );
  const points: LiveMetricPoint[] = [];
  for (const row of response.rows ?? []) {
    const date = toIsoDate(row.dimensionValues?.[0]?.value ?? "");
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const pageviews = Number(row.metricValues?.[1]?.value ?? 0);
    if (!date || !Number.isFinite(sessions) || !Number.isFinite(pageviews)) continue;
    points.push({ provider: "ga4", metric_name: "sessions", date, value: sessions, metadata: { source: "ga4.data_api" } });
    points.push({ provider: "ga4", metric_name: "pageviews", date, value: pageviews, metadata: { source: "ga4.data_api" } });
  }
  return points;
}

type GscResponse = { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };

async function fetchGsc(from: string, to: string): Promise<LiveMetricPoint[]> {
  const site = config("GSC_SITE_URL");
  if (!site) throw new AppError(422, "INTEGRATION_NOT_CONFIGURED", "GSC_SITE_URL is not configured");
  const token = await googleAccessToken(
    ["https://www.googleapis.com/auth/webmasters.readonly"],
    config("GSC_SERVICE_ACCOUNT_JSON") ? "GSC_SERVICE_ACCOUNT_JSON" : "GOOGLE_SERVICE_ACCOUNT_JSON",
  );
  const response = await jsonRequest<GscResponse>(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: from, endDate: to, dimensions: ["date"], rowLimit: 25_000, dataState: "final" }),
    },
    "Search Console",
  );
  const points: LiveMetricPoint[] = [];
  for (const row of response.rows ?? []) {
    const date = row.keys?.[0] ?? "";
    if (!date || !Number.isFinite(Number(row.clicks)) || !Number.isFinite(Number(row.impressions))) continue;
    points.push({ provider: "gsc", metric_name: "search_clicks", date, value: Number(row.clicks), metadata: { source: "searchconsole.api", ctr: row.ctr ?? null, position: row.position ?? null } });
    points.push({ provider: "gsc", metric_name: "search_impressions", date, value: Number(row.impressions), metadata: { source: "searchconsole.api", ctr: row.ctr ?? null, position: row.position ?? null } });
  }
  return points;
}

type MetaResponse = { data?: Array<{ date_start?: string; date_stop?: string; spend?: string }> };

async function fetchMeta(from: string, to: string): Promise<LiveMetricPoint[]> {
  const account = config("META_AD_ACCOUNT_ID");
  const token = config("META_ADS_ACCESS_TOKEN");
  if (!account || !token) throw new AppError(422, "INTEGRATION_NOT_CONFIGURED", "META_AD_ACCOUNT_ID and META_ADS_ACCESS_TOKEN are required");
  const version = config("META_GRAPH_API_VERSION") ?? "v20.0";
  const timeRange = encodeURIComponent(JSON.stringify({ since: from, until: to }));
  const response = await jsonRequest<MetaResponse>(
    `https://graph.facebook.com/${version}/act_${encodeURIComponent(account.replace(/^act_/, ""))}/insights?fields=date_start,date_stop,spend&time_range=${timeRange}&time_increment=1`,
    { headers: { accept: "application/json", authorization: `Bearer ${token}` } },
    "Meta Ads",
  );
  return (response.data ?? []).flatMap((row) => {
    const value = Number(row.spend ?? 0);
    return row.date_start && Number.isFinite(value)
      ? [{ provider: "meta_ads" as const, metric_name: "ad_spend" as const, date: row.date_start, value, currency: config("META_AD_CURRENCY") ?? "VND", metadata: { source: "meta.graph_api" } }]
      : [];
  });
}

async function insertSnapshots(workspaceId: string, points: LiveMetricPoint[], from: string, to: string): Promise<void> {
  if (points.length === 0) return;
  await withTransaction(async (client) => {
    const groups = [...new Set(points.map((point) => `${point.provider}:${point.metric_name}`))];
    for (const group of groups) {
      const [provider, metric] = group.split(":");
      await client.query(
        "DELETE FROM metrics_snapshots WHERE workspace_id=$1 AND provider=$2 AND metric_name=$3 AND period_from BETWEEN $4::date AND $5::date",
        [workspaceId, provider, metric, from, to],
      );
    }
    for (const point of points) {
      await client.query(
        `INSERT INTO metrics_snapshots
          (workspace_id, provider, metric_name, period_from, period_to, timezone, currency, metric_value, availability, missing_reason, metadata)
         VALUES ($1,$2,$3,$4::date,$4::date,'Asia/Ho_Chi_Minh',$5,$6,'available',NULL,$7::jsonb)`,
        [workspaceId, point.provider, point.metric_name, point.date, point.currency ?? "VND", point.value, JSON.stringify({ ...point.metadata, synced_at: new Date().toISOString() })],
      );
    }
  });
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = new Date(`${from}T00:00:00Z`); cursor <= new Date(`${to}T00:00:00Z`); cursor = new Date(cursor.getTime() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function insertNoDataSnapshots(workspaceId: string, provider: Provider, metrics: string[], from: string, to: string): Promise<void> {
  const dates = datesBetween(from, to);
  if (!dates.length) return;
  await withTransaction(async (client) => {
    for (const metric of metrics) {
      await client.query(
        "DELETE FROM metrics_snapshots WHERE workspace_id=$1 AND provider=$2 AND metric_name=$3 AND period_from BETWEEN $4::date AND $5::date",
        [workspaceId, provider, metric, from, to],
      );
      for (const date of dates) {
        await client.query(
          `INSERT INTO metrics_snapshots
            (workspace_id, provider, metric_name, period_from, period_to, timezone, currency, metric_value, availability, missing_reason, metadata)
           VALUES ($1,$2,$3,$4::date,$4::date,'Asia/Ho_Chi_Minh',$5,NULL,'missing','NO_DATA_IN_RANGE',$6::jsonb)`,
          [workspaceId, provider, metric, date, provider === "meta_ads" ? (config("META_AD_CURRENCY") ?? "VND") : "VND", JSON.stringify({ source: provider, synced_at: new Date().toISOString() })],
        );
      }
    }
  });
}

async function markProviderVerified(workspaceId: string, provider: Provider): Promise<void> {
  const configByProvider: Record<Provider, { accountRef: string | undefined; scopes: string[]; displayName: string }> = {
    ga4: {
      accountRef: config("GA4_PROPERTY_ID"),
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
      displayName: "Google Analytics 4",
    },
    gsc: {
      accountRef: config("GSC_SITE_URL"),
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      displayName: "Google Search Console",
    },
    meta_ads: {
      accountRef: config("META_AD_ACCOUNT_ID"),
      scopes: ["ads_read"],
      displayName: "Meta Ads",
    },
  };
  const entry = configByProvider[provider];
  if (!entry.accountRef) return;
  await upsertConnection({
    workspaceId,
    provider,
    accountRef: entry.accountRef,
    displayName: entry.displayName,
    scopes: entry.scopes,
    credentialRef: `${provider}:server-configured`,
    status: "connected",
    verifiedAt: new Date().toISOString(),
  });
}

export async function syncLiveMetrics(workspaceId: string, from: string, to: string) {
  const range = dateRange(from, to);
  if ((process.env.INTEGRATION_MODE ?? "fake") !== "production") {
    throw new AppError(422, "LIVE_CONNECTORS_DISABLED", "Set INTEGRATION_MODE=production after provider credentials are configured");
  }
  const jobs: Array<{ provider: Provider; configured: boolean; run: () => Promise<LiveMetricPoint[]> }> = [
    { provider: "ga4", configured: Boolean(config("GOOGLE_SERVICE_ACCOUNT_JSON") && config("GA4_PROPERTY_ID")), run: () => fetchGa4(range.from, range.to) },
    { provider: "gsc", configured: Boolean((config("GSC_SERVICE_ACCOUNT_JSON") || config("GOOGLE_SERVICE_ACCOUNT_JSON")) && config("GSC_SITE_URL")), run: () => fetchGsc(range.from, range.to) },
    { provider: "meta_ads", configured: Boolean(config("META_ADS_ACCESS_TOKEN") && config("META_AD_ACCOUNT_ID")), run: () => fetchMeta(range.from, range.to) },
  ];
  const allPoints: LiveMetricPoint[] = [];
  const results: LiveSyncResult[] = [];
  for (const job of jobs) {
    if (!job.configured) {
      results.push({ provider: job.provider, status: "skipped", points: 0, missing_reason: job.provider === "gsc" ? "PROPERTY_NOT_VERIFIED" : job.provider === "meta_ads" ? "META_ADS_ACCESS_MISSING" : "GOOGLE_CREDENTIALS_NOT_CONFIGURED" });
      continue;
    }
    try {
      const points = await job.run();
      allPoints.push(...points);
      await markProviderVerified(workspaceId, job.provider);
      if (points.length === 0) {
        const metrics = job.provider === "ga4"
          ? ["sessions", "pageviews"]
          : job.provider === "gsc"
          ? ["search_clicks", "search_impressions"]
          : ["ad_spend"];
        await insertNoDataSnapshots(workspaceId, job.provider, metrics, range.from, range.to);
      }
      results.push({ provider: job.provider, status: points.length ? "synced" : "no_data", points: points.length });
    } catch (error) {
      results.push({ provider: job.provider, status: "error", points: 0, error: error instanceof Error ? error.message : "Provider request failed" });
    }
  }
  await insertSnapshots(workspaceId, allPoints, range.from, range.to);
  return { from: range.from, to: range.to, points_saved: allPoints.length, results };
}
