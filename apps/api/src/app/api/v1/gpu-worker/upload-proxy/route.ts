import { NextRequest } from "next/server";
import { handleWorkerError } from "@/modules/gpuWorkers/auth";
import { handleUploadProxyService } from "@/modules/gpuWorkers/service";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    return await handleUploadProxyService(req);
  } catch (err) {
    return handleWorkerError(err);
  }
}

