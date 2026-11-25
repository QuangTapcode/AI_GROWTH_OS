import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { MultiLLMAdapterService } from "@/modules/ai/llmAdapter";

type Ctx = { params: { workspace_id: string } };

/** Cấu hình Multi-LLM của workspace. Khóa API chỉ trả dạng đã che (••••1234). Chỉ owner. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const config = await new MultiLLMAdapterService().getConfig(params.workspace_id);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const config = await new MultiLLMAdapterService().updateConfig(params.workspace_id, await readJsonBody(req));
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PUT = POST;
