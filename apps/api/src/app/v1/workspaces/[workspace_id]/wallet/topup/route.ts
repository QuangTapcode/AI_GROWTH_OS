import { NextRequest, NextResponse } from 'next/server';
import { MerchantWalletService } from '../../../../../../modules/billing/wallet';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const packageName = body.package_name || 'growth';
    const service = new MerchantWalletService();
    const tx = await service.createTopup(params.workspace_id, packageName);
    return NextResponse.json({ ok: true, transaction: tx });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to create topup transaction' }, { status: 500 });
  }
}

