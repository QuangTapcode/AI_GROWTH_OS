import { NextRequest, NextResponse } from 'next/server';
import { MerchantWalletService } from '../../../../../../modules/billing/wallet';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { transaction_id } = body;
    if (!transaction_id) {
      return NextResponse.json({ ok: false, error: 'transaction_id is required' }, { status: 400 });
    }

    const service = new MerchantWalletService();
    const wallet = await service.confirmPayment(params.workspace_id, transaction_id);
    return NextResponse.json({ ok: true, wallet });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to confirm topup' }, { status: 500 });
  }
}

