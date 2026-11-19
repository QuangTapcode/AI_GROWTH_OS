import { NextRequest, NextResponse } from 'next/server';
import { BookingLeadsService } from '../../../../../../modules/booking/leads';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;

    const service = new BookingLeadsService();
    const leads = await service.listLeads(params.workspace_id, { status, limit });
    return NextResponse.json({ ok: true, leads });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to list booking leads' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const service = new BookingLeadsService();
    const created = await service.createLead(params.workspace_id, body);
    return NextResponse.json({ ok: true, lead: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to create booking lead' }, { status: 500 });
  }
}

