import { NextRequest, NextResponse } from 'next/server';
import { BookingLeadsService } from '../../../../../../../modules/booking/leads';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { workspace_id: string; lead_id: string } }
) {
  try {
    const body = await request.json();
    const service = new BookingLeadsService();
    const updated = await service.updateLead(params.workspace_id, params.lead_id, body);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Booking lead not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lead: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to update booking lead' }, { status: 500 });
  }
}

