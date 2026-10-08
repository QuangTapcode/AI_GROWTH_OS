/**
 * Singleton dependencies for Public Routes (Leads & Public Content)
 * W1-TQ-06: Mount and bridge framework-agnostic handlers to Next.js App Router
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createLeadRoutes,
  InMemoryLeadRepository,
  type LeadRoutes,
} from "@/modules/leads";
import {
  createPublicContentRoutes,
  InMemoryPublicContentRepository,
  type PublicContentRoutes,
} from "@/modules/publicContent";
import { MemoryAnalyticsSink } from "./analytics";
import type { HttpResult } from "./http";

// Singleton instances for development and local testing
export const globalLeadRepo = new InMemoryLeadRepository();
export const globalAnalyticsSink = new MemoryAnalyticsSink();
export const globalPublicContentRepo = new InMemoryPublicContentRepository();

export const leadRoutes: LeadRoutes = createLeadRoutes({
  repo: globalLeadRepo,
  analytics: globalAnalyticsSink,
});

export const publicContentRoutes: PublicContentRoutes =
  createPublicContentRoutes({
    repo: globalPublicContentRepo,
  });

/**
 * Chuyển đổi NextRequest thành định dạng PublicHttpRequest
 */
export async function toPublicHttpRequest(
  req: NextRequest,
  params: Record<string, string>
) {
  let body: unknown = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((val, key) => {
    headers[key.toLowerCase()] = val;
  });

  const requestId = headers["x-request-id"] || crypto.randomUUID();

  return {
    params,
    headers,
    body,
    request_id: requestId,
  };
}

/**
 * Chuyển đổi HttpResult thành NextResponse của Next.js
 */
export function toNextResponse(result: HttpResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
  });
}
