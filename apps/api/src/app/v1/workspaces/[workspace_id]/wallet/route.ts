import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { MerchantWalletService } from "@/modules/billing/wallet";

/** Số dư credit thật, gói nạp, lịch sử giao dịch. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const wallet = await new MerchantWalletService().getWallet(params.workspace_id);
    return NextResponse.json({ ok: true, wallet });
  } catch (error) {
    return handleApiError(error);
  }
}
