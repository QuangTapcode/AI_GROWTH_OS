import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { MerchantWalletService } from "@/modules/billing/wallet";

const schema = z.object({ transaction_id: z.string().uuid() });

/**
 * Xác nhận tay (chỉ khi WALLET_ALLOW_MANUAL_CONFIRM=1, dùng cho staging/ demo).
 * Production: trả 409 AWAITING_BANK_CONFIRMATION — credit chỉ cộng qua webhook ngân hàng.
 */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const { transaction_id } = schema.parse(await readJsonBody(req));
    const wallet = await new MerchantWalletService().confirmManually(params.workspace_id, transaction_id, tenant.user.id);
    return NextResponse.json({ ok: true, wallet });
  } catch (error) {
    return handleApiError(error);
  }
}
