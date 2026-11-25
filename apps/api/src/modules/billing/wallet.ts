import type { Pool } from "pg";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { paymentReference, platformWalletAccount, vietQrImageUrl } from "./vietqr";

/**
 * Ví tín dụng trả trước của quán (Phần IV.3 kế hoạch Leader).
 * - Nạp: tạo giao dịch "chờ thanh toán" kèm mã VietQR động (Napas 247) và mã tham chiếu duy nhất.
 * - Cộng credit CHỈ khi ngân hàng báo đã nhận tiền (webhook /v1/webhooks/payments, khớp mã + đủ số tiền),
 *   hoặc xác nhận tay khi môi trường thử nghiệm bật WALLET_ALLOW_MANUAL_CONFIRM=1.
 * - Tiêu: mỗi lần agent gọi AI thành công trừ 1 credit (modules/ai/llmAdapter.ts); hết credit thì agent dừng.
 */
export const TOPUP_PACKAGES = {
  starter: { amount_vnd: 200_000, credits: 1_000, label: "Gói Khởi Động" },
  growth: { amount_vnd: 500_000, credits: 3_000, label: "Gói Tăng Trưởng" },
  scale: { amount_vnd: 1_500_000, credits: 10_000, label: "Gói Bứt Phá" },
} as const;
export type TopupPackage = keyof typeof TOPUP_PACKAGES;

const PENDING_TTL_MS = 24 * 3600_000;

export interface WalletTransaction {
  id: string;
  package_name: string;
  amount_vnd: number;
  credits: number;
  qr_reference: string;
  status: "pending" | "success" | "expired" | "failed";
  vietqr_image_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
}

export interface WalletState {
  workspace_id: string;
  balance_credits: number;
  tier: string;
  credits_used_7d: number;
  packages: Array<{ id: TopupPackage; amount_vnd: number; credits: number; label: string }>;
  transactions: WalletTransaction[];
  payment_configured: boolean;
  manual_confirm_enabled: boolean;
}

function mapTx(row: any): WalletTransaction {
  const meta = (row.metadata ?? {}) as { vietqr_image_url?: string };
  return {
    id: row.id,
    package_name: row.package_name,
    amount_vnd: Number(row.amount_vnd),
    credits: Number(row.credits_added),
    qr_reference: row.qr_reference,
    status: row.status === "pending" && row.expires_at && new Date(row.expires_at).getTime() < Date.now() ? "expired" : row.status,
    vietqr_image_url: meta.vietqr_image_url ?? null,
    created_at: new Date(row.created_at).toISOString(),
    confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

function manualConfirmEnabled(): boolean {
  return process.env.WALLET_ALLOW_MANUAL_CONFIRM === "1" && process.env.NODE_ENV !== "production";
}

export class MerchantWalletService {
  constructor(private readonly db: Pick<Pool, "query" | "connect"> = defaultPool) {}

  async getWallet(workspaceId: string): Promise<WalletState> {
    await this.db.query(`INSERT INTO merchant_wallet (workspace_id) VALUES ($1::uuid) ON CONFLICT (workspace_id) DO NOTHING`, [workspaceId]);
    const [wallet, txs, usage] = await Promise.all([
      this.db.query(`SELECT balance_credits, tier FROM merchant_wallet WHERE workspace_id = $1::uuid`, [workspaceId]),
      this.db.query(`SELECT * FROM merchant_wallet_transactions WHERE workspace_id = $1::uuid ORDER BY created_at DESC LIMIT 20`, [workspaceId]),
      this.db.query(`SELECT COALESCE(SUM(credits_charged), 0)::int AS used FROM llm_usage_events WHERE workspace_id = $1::uuid AND created_at > NOW() - INTERVAL '7 days'`, [
        workspaceId,
      ]),
    ]);
    return {
      workspace_id: workspaceId,
      balance_credits: Number(wallet.rows[0]?.balance_credits ?? 0),
      tier: wallet.rows[0]?.tier ?? "growth",
      credits_used_7d: Number(usage.rows[0]?.used ?? 0),
      packages: (Object.keys(TOPUP_PACKAGES) as TopupPackage[]).map((id) => ({ id, ...TOPUP_PACKAGES[id] })),
      transactions: txs.rows.map(mapTx),
      payment_configured: platformWalletAccount() !== null,
      manual_confirm_enabled: manualConfirmEnabled(),
    };
  }

  async createTopup(workspaceId: string, packageName: string): Promise<WalletTransaction> {
    if (!(packageName in TOPUP_PACKAGES)) throw new AppError(422, "INVALID_PACKAGE", "Gói nạp không hợp lệ (starter, growth, scale)");
    const pkg = TOPUP_PACKAGES[packageName as TopupPackage];
    const account = platformWalletAccount();
    if (!account) throw new AppError(503, "WALLET_NOT_CONFIGURED", "Chưa cấu hình tài khoản nhận tiền (WALLET_BANK_BIN / WALLET_BANK_ACCOUNT)");
    const reference = paymentReference("NAP");
    const qr = vietQrImageUrl(account, pkg.amount_vnd, reference);
    const row = (
      await this.db.query(
        `INSERT INTO merchant_wallet_transactions (workspace_id, amount_vnd, credits_added, package_name, qr_reference, payment_method, status, expires_at, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, 'vietqr', 'pending', $6, $7::jsonb) RETURNING *`,
        [workspaceId, pkg.amount_vnd, pkg.credits, packageName, reference, new Date(Date.now() + PENDING_TTL_MS).toISOString(), JSON.stringify({ vietqr_image_url: qr, bank_bin: account.bankBin })],
      )
    ).rows[0];
    return mapTx(row);
  }

  /**
   * Cộng credit cho giao dịch chờ (một lần duy nhất). Dùng cho webhook ngân hàng và xác nhận tay ở staging.
   * Trả null nếu không có giao dịch chờ khớp mã (đã cộng rồi / hết hạn / sai mã).
   */
  async settle(reference: string, paidAmountVnd: number, confirmedBy: string): Promise<{ workspace_id: string; transaction: WalletTransaction; balance_credits: number } | null> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const tx = (
        await client.query(
          `SELECT * FROM merchant_wallet_transactions WHERE qr_reference = $1 AND status = 'pending' FOR UPDATE`,
          [reference],
        )
      ).rows[0];
      if (!tx || (tx.expires_at && new Date(tx.expires_at).getTime() < Date.now() - 3600_000)) {
        await client.query("ROLLBACK");
        return null;
      }
      if (paidAmountVnd < Number(tx.amount_vnd)) {
        await client.query(
          `UPDATE merchant_wallet_transactions SET metadata = metadata || $2::jsonb WHERE id = $1`,
          [tx.id, JSON.stringify({ underpaid_amount_vnd: paidAmountVnd, underpaid_at: new Date().toISOString() })],
        );
        await client.query("COMMIT");
        throw new AppError(422, "UNDERPAID", `Số tiền nhận ${paidAmountVnd} nhỏ hơn giá gói ${tx.amount_vnd}`);
      }
      const updated = (
        await client.query(
          `UPDATE merchant_wallet_transactions SET status = 'success', confirmed_at = NOW(), confirmed_by = $2 WHERE id = $1 RETURNING *`,
          [tx.id, confirmedBy.slice(0, 64)],
        )
      ).rows[0];
      await client.query(`INSERT INTO merchant_wallet (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`, [tx.workspace_id]);
      const wallet = (
        await client.query(
          `UPDATE merchant_wallet SET balance_credits = balance_credits + $2, balance_vnd = balance_vnd + $3, updated_at = NOW()
            WHERE workspace_id = $1 RETURNING balance_credits`,
          [tx.workspace_id, Number(tx.credits_added), Number(tx.amount_vnd)],
        )
      ).rows[0];
      await client.query("COMMIT");
      return { workspace_id: tx.workspace_id, transaction: mapTx(updated), balance_credits: Number(wallet.balance_credits) };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Xác nhận tay (chỉ môi trường thử nghiệm có WALLET_ALLOW_MANUAL_CONFIRM=1). */
  async confirmManually(workspaceId: string, transactionId: string, actorId: string): Promise<WalletState> {
    if (!manualConfirmEnabled()) {
      throw new AppError(409, "AWAITING_BANK_CONFIRMATION", "Giao dịch sẽ tự cộng credit khi ngân hàng xác nhận đã nhận tiền");
    }
    const tx = (await this.db.query(`SELECT qr_reference, amount_vnd FROM merchant_wallet_transactions WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, transactionId])).rows[0];
    if (!tx) throw new AppError(404, "TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch");
    const settled = await this.settle(tx.qr_reference, Number(tx.amount_vnd), `manual:${actorId}`);
    if (!settled) throw new AppError(409, "TRANSACTION_NOT_PENDING", "Giao dịch đã được xử lý hoặc đã hết hạn");
    return this.getWallet(workspaceId);
  }
}

/** Tìm mã nạp ví (NAPxxxxxxxx) trong nội dung chuyển khoản ngân hàng. */
export function extractTopupReference(transferContent: string): string | null {
  const m = transferContent.toUpperCase().match(/NAP[A-HJ-NP-Z2-9]{8}/);
  return m ? m[0] : null;
}
