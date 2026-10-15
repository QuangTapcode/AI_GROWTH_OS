import { NextResponse } from "next/server";
import { testDbConnection } from "@/lib/db";

export async function GET() {
    const isDbReady = await testDbConnection();
    if (!isDbReady) {
        return NextResponse.json(
            {
                status: "error",
                service: "api-growth-os-api",
                database: "disconnected",
            },
            { status: 503 }
        );
    }

    return NextResponse.json(
        {
            status: "ok",
            service: "api-growth-os-api",
            database: "connected",
        },
        { status: 200 }
    );
}