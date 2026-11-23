import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MerchantWalletService } from '../../../../modules/billing/wallet';

/**
 * Payment webhook receiver for SePay / Casso / PayOS bank transfer reconciliation.
 * Matches `AGY...` reference code inside transfer memo and credits the tenant's SaaS wallet automatically.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.VIETQR_WEBHOOK_SECRET?.trim();
  if (secret) {
    const supplied = (request.headers.get('x-webhook-secret') || request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const a = Buffer.from(supplied);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const memoText = String(body.content || body.description || body.addInfo || body.qr_reference || '');
  const refMatch = memoText.match(/AGY[A-Z]{2,6}\d{4,8}/i);
  const qrReference = refMatch ? refMatch[0].toUpperCase() : String(body.qr_reference || '').trim();
  const amountVnd = Number(body.transferAmount ?? body.amount ?? body.amount_vnd ?? 0);

  if (!qrReference) {
    return NextResponse.json({ ok: false, error: 'Missing AGY reference code in transfer memo' }, { status: 400 });
  }

  const service = new MerchantWalletService();
  const result = await service.confirmByQrReference(qrReference, amountVnd > 0 ? amountVnd : undefined);
  return NextResponse.json({ ok: result.matched, ...result }, { status: result.matched ? 200 : 404 });
}

