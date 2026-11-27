import { NextRequest } from "next/server";
import { handleWorkerError } from "@/modules/gpuWorkers/auth";
import { claimGpuJobService } from "@/modules/gpuWorkers/service";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    return await claimGpuJobService(req, rawBody);
  } catch (err) {
    return handleWorkerError(err);
  }
}

