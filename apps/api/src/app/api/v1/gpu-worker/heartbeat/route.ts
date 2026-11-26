import { NextRequest } from "next/server";
import { handleWorkerError } from "@/modules/gpuWorkers/auth";
import { heartbeatGpuJobService } from "@/modules/gpuWorkers/service";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    return await heartbeatGpuJobService(req, rawBody);
  } catch (err) {
    return handleWorkerError(err);
  }
}

