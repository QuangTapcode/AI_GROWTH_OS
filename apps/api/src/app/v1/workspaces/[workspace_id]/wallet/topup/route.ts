import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { MerchantWalletService } from "@/modules/billing/wallet";

const schema = z.object({ package_name: z.enum(["starter", "growth", "scale"]) });

/** Tạo giao dịch nạp: trả mã VietQR + mã tham chiếu; credit được cộng khi ngân hàng xác nhận. Chỉ owner. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const { package_name } = schema.parse(await readJsonBody(req));
    const transaction = await new MerchantWalletService().createTopup(params.workspace_id, package_name);
    return NextResponse.json({ ok: true, transaction }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
