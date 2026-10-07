import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "AI Growth OS - Core API",
    version: "0.1.0",
    status: "running",
    endpoints: {
      health: "/healthz",
      readiness: "/readyz",
    },
  });
}
