import { healthResponse, preflightResponse } from "@/lib/health-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = healthResponse;
export const OPTIONS = preflightResponse;

