import { NextRequest, NextResponse } from 'next/server';
import { MultiLLMAdapterService, LLMProvider } from '../../../../../../../modules/ai/llmAdapter';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const provider = (body.provider || 'gemini') as LLMProvider;
    const service = new MultiLLMAdapterService();
    const pingResult = await service.pingProvider(params.workspace_id, provider);
    return NextResponse.json({ ok: true, ping: pingResult });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to ping provider' }, { status: 500 });
  }
}

