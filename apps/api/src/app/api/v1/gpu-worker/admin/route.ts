import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import {
  gpuIsOnline,
  listAllGpuWorkers,
  listRecentImageJobs,
} from "@/modules/gpuWorkers/repository";

export async function GET(req: NextRequest) {
  try {
    const isOnline = await gpuIsOnline();
    const workers = await listAllGpuWorkers();
    const recentJobs = await listRecentImageJobs(20);

    const safeWorkers = workers.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      last_seen_at: w.last_seen_at,
      vram_free_mb: w.vram_free_mb,
      worker_version: w.worker_version,
      engine_version: w.engine_version,
      model_key: w.model_key,
      active_job_id: w.active_job_id,
      created_at: w.created_at,
    }));

    const safeJobs = recentJobs.map((j) => ({
      id: j.id,
      root_job_id: j.root_job_id,
      attempt: j.attempt,
      delivery_count: j.delivery_count,
      status: j.status,
      prompt: j.request?.prompt || "",
      aspect_ratio: j.request?.aspect_ratio || "1:1",
      model_name: j.request?.model_name || "Juggernaut XL v9",
      seed: j.request?.seed || null,
      error_code: j.error_code,
      error_message: j.error_message,
      claimed_by: j.claimed_by,
      result_sha256: j.result_sha256,
      created_at: j.created_at,
      completed_at: j.completed_at,
    }));

    return NextResponse.json(
      {
        gpu_online: isOnline,
        workers: safeWorkers,
        recent_jobs: safeJobs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
