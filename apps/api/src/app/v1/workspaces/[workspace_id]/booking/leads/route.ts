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
    let replyText: string | undefined;

    if (body.action === 'auto_reply_and_capture' || body.customer_message) {
      const consult = await service.generate1on1ConsultationReply(
        params.workspace_id,
        String(body.customer_message || body.special_notes || ''),
        String(body.customer_name || 'Khách tương tác Inbox')
      );
      replyText = consult.reply_text;
      body.consultation_summary = replyText;
    }

    const created = await service.createLead(params.workspace_id, body);
    return NextResponse.json({ ok: true, lead: created, reply: replyText }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to create booking lead' }, { status: 500 });
  }
}

