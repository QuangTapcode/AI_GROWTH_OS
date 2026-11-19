import { NextRequest, NextResponse } from 'next/server';
import { MerchantWalletService } from '../../../../../modules/billing/wallet';

export async function GET(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new MerchantWalletService();
    const wallet = await service.getWallet(params.workspace_id);
    return NextResponse.json({ ok: true, wallet });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to fetch wallet' }, { status: 500 });
  }
}
