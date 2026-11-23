import { NextRequest, NextResponse } from 'next/server';
import { MultiLLMAdapterService } from '../../../../../../modules/ai/llmAdapter';

export async function GET(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new MultiLLMAdapterService();
    const config = await service.getConfig(params.workspace_id);
    return NextResponse.json({ ok: true, config });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to get LLM config' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const service = new MultiLLMAdapterService();
    const updated = await service.updateConfig(params.workspace_id, body);
    return NextResponse.json({ ok: true, config: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to update LLM config' }, { status: 500 });
  }
}

