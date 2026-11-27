import { NextRequest } from "next/server";
import { handleWorkerError } from "@/modules/gpuWorkers/auth";
import { completeGpuJobService } from "@/modules/gpuWorkers/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    return await completeGpuJobService(req, rawBody);
  } catch (err) {
    return handleWorkerError(err);
  }
}

