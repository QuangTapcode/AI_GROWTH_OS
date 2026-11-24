import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { MultiLLMAdapterService } from "@/modules/ai/llmAdapter";

const schema = z.object({ provider: z.enum(["gemini", "deepseek", "openai", "claude"]) });

/** Gửi request thật rất ngắn tới nhà cung cấp để kiểm tra khóa và đo độ trễ. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const { provider } = schema.parse(await readJsonBody(req));
    const result = await new MultiLLMAdapterService().pingProvider(params.workspace_id, provider);
    return NextResponse.json({ ok: result.status === "ok", result });
  } catch (error) {
    return handleApiError(error);
  }
}
