import pool from '../../lib/db';

export interface WalletState {
  workspace_id: string;
  balance_credits: number;
  balance_vnd: number;
  tier: 'free' | 'starter' | 'growth' | 'enterprise';
  transactions: Array<{
    id: string;
    type: 'topup' | 'usage';
    credits: number;
    amount_vnd: number;
    description: string;
    created_at: string;
  }>;
}

export interface TopupInvoice {
  workspace_id: string;
  amount_vnd: number;
  credits_to_add: number;
  package_name: string;
  qr_reference: string;
  vietqr_image_url: string;
  payment_method: string;
  status: 'pending' | 'success';
  created_at: string;
}

const memoryWallets = new Map<string, WalletState>();

export class MerchantWalletService {
  constructor(private readonly db = pool) {}

  async getWallet(workspaceId: string): Promise<WalletState> {
    try {
      const wRes = await this.db.query(
        `SELECT * FROM merchant_wallet WHERE workspace_id = $1::uuid`,
        [workspaceId]
      );

      let wallet = wRes.rows[0];
      if (!wallet) {
        const init = await this.db.query(
          `INSERT INTO merchant_wallet (workspace_id, balance_credits, balance_vnd, tier)
           VALUES ($1::uuid, 1200, 250000, 'growth')
           ON CONFLICT (workspace_id) DO NOTHING
           RETURNING *`,
          [workspaceId]
        );
        wallet = init.rows[0] || { balance_credits: 1200, balance_vnd: 250000, tier: 'growth' };
      }

      const txRes = await this.db.query(
        `SELECT * FROM merchant_wallet_transactions
         WHERE workspace_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 10`,
        [workspaceId]
      );

      return {
        workspace_id: workspaceId,
        balance_credits: Number(wallet.balance_credits || 1200),
        balance_vnd: Number(wallet.balance_vnd || 250000),
        tier: wallet.tier || 'growth',
        transactions: (txRes.rows || []).map((t: any) => ({
          id: t.id,
          type: t.tx_type,
          credits: Number(t.credits || 0),
          amount_vnd: Number(t.amount_vnd || 0),
          description: t.description || 'Giao dịch ví',
          created_at: new Date(t.created_at).toISOString(),
        })),
      };
    } catch {
      if (!memoryWallets.has(workspaceId)) {
        memoryWallets.set(workspaceId, {
          workspace_id: workspaceId,
          balance_credits: 1500,
          balance_vnd: 500000,
          tier: 'growth',
          transactions: [
            {
              id: 'tx_init',
              type: 'topup',
              credits: 1500,
              amount_vnd: 500000,
              description: 'Nạp gói Growth Tăng Trưởng (500k VND)',
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
      return memoryWallets.get(workspaceId)!;
    }
  }

  generateVietQRTopupInvoice(
    workspaceId: string,
    packageName: 'starter' | 'growth' | 'scale'
  ): TopupInvoice {
    const packages = {
      starter: { amount: 200000, credits: 500, label: 'Gói Khởi Động (500 Credits)' },
      growth: { amount: 500000, credits: 1500, label: 'Gói Tăng Trưởng (1.500 Credits - Khuyên dùng)' },
      scale: { amount: 1500000, credits: 5000, label: 'Gói Đột Phá Doanh Thu (5.000 Credits)' },
    };

    const sel = packages[packageName] || packages.growth;
    const refCode = `AGY${Date.now().toString().slice(-6)}`;
    const bankBin = '970422'; // MB Bank
    const bankAcc = '0905123456';
    const memo = `NAP TIEN ${refCode}`;

    const vietQrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAcc}-compact2.png?amount=${sel.amount}&addInfo=${encodeURIComponent(
      memo
    )}&accountName=AI%20GROWTH%20OS`;

    return {
      workspace_id: workspaceId,
      amount_vnd: sel.amount,
      credits_to_add: sel.credits,
      package_name: sel.label,
      qr_reference: refCode,
      vietqr_image_url: vietQrUrl,
      payment_method: 'Napas247 VietQR',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
  }

  async confirmTopup(
    workspaceId: string,
    credits: number,
    amountVnd: number,
    description: string
  ): Promise<WalletState> {
    try {
      await this.db.query(
        `UPDATE merchant_wallet
         SET balance_credits = balance_credits + $2::numeric,
             balance_vnd = balance_vnd + $3::numeric,
             updated_at = NOW()
         WHERE workspace_id = $1::uuid`,
        [workspaceId, credits, amountVnd]
      );

      await this.db.query(
        `INSERT INTO merchant_wallet_transactions (
          workspace_id, tx_type, credits, amount_vnd, description, status
        ) VALUES (
          $1::uuid, 'topup', $2::numeric, $3::numeric, $4::varchar, 'success'
        )`,
        [workspaceId, credits, amountVnd, description]
      );

      return this.getWallet(workspaceId);
    } catch {
      const cur = await this.getWallet(workspaceId);
      cur.balance_credits += credits;
      cur.balance_vnd += amountVnd;
      cur.transactions.unshift({
        id: `tx_${Date.now()}`,
        type: 'topup',
        credits,
        amount_vnd: amountVnd,
        description,
        created_at: new Date().toISOString(),
      });
      return cur;
    }
  }

  async createTopup(workspaceId: string, packageName: string = 'growth'): Promise<any> {
    const packages: Record<string, { amount: number; credits: number; label: string }> = {
      starter: { amount: 200000, credits: 1000, label: 'Gói Khởi Động (1.000 Credits)' },
      growth: { amount: 500000, credits: 3000, label: 'Gói Tăng Trưởng (3.000 Credits)' },
      enterprise: { amount: 1500000, credits: 10000, label: 'Gói Doanh Nghiệp (10.000 Credits)' },
      scale: { amount: 1500000, credits: 10000, label: 'Gói Doanh Nghiệp (10.000 Credits)' },
    };
    const key = packageName.toLowerCase();
    const sel = packages[key] || packages.growth;
    const refCode = `AGY${key.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-6)}`;
    const bankBin = process.env.VIETQR_BANK_BIN?.trim() || '970422';
    const bankAcc = process.env.VIETQR_ACCOUNT_NO?.trim() || '0905123456';
    const accName = process.env.VIETQR_ACCOUNT_NAME?.trim() || 'AI GROWTH OS';
    const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAcc}-compact2.png?amount=${sel.amount}&addInfo=${encodeURIComponent(refCode)}&accountName=${encodeURIComponent(accName)}`;

    let txId = `tx_${Date.now()}`;
    try {
      const res = await this.db.query(
        `INSERT INTO merchant_wallet_transactions (
          workspace_id, tx_type, credits, amount_vnd, description, status, metadata
        ) VALUES (
          $1::uuid, 'topup', $2::numeric, $3::numeric, $4::varchar, 'pending', $5::jsonb
        ) RETURNING *`,
        [
          workspaceId,
          sel.credits,
          sel.amount,
          sel.label,
          JSON.stringify({ qr_reference: refCode, vietqr_image_url: qrUrl, bank_bin: bankBin, account_no: bankAcc, account_name: accName }),
        ]
      );
      if (res.rows?.[0]?.id) txId = res.rows[0].id;
    } catch {
      // Ignored
    }

    return {
      id: txId,
      workspace_id: workspaceId,
      package_name: sel.label,
      amount_vnd: sel.amount,
      credits_added: sel.credits,
      qr_reference: refCode,
      vietqr_image_url: qrUrl,
      bank_bin: bankBin,
      account_no: bankAcc,
      account_name: accName,
      is_demo_bank: !process.env.VIETQR_ACCOUNT_NO,
      status: 'pending',
    };
  }

  async confirmPayment(workspaceId: string, txId: string): Promise<WalletState> {
    try {
      const txRes = await this.db.query(
        `SELECT * FROM merchant_wallet_transactions
         WHERE workspace_id = $1::uuid AND id = $2::uuid
         LIMIT 1`,
        [workspaceId, txId]
      );
      const tx = txRes.rows[0];
      if (!tx) {
        return this.getWallet(workspaceId);
      }
      if (tx.status === 'success') {
        // Idempotent: already confirmed
        return this.getWallet(workspaceId);
      }
      const credits = Number(tx.credits || 0);
      const amountVnd = Number(tx.amount_vnd || 0);
      const nextTier = amountVnd >= 1500000 ? 'enterprise' : amountVnd >= 500000 ? 'growth' : 'starter';

      await this.db.query(
        `UPDATE merchant_wallet_transactions SET status = 'success' WHERE workspace_id = $1::uuid AND id = $2::uuid`,
        [workspaceId, txId]
      );
      await this.db.query(
        `INSERT INTO merchant_wallet (workspace_id, balance_credits, balance_vnd, tier)
         VALUES ($1::uuid, $2::numeric, $3::numeric, $4::varchar)
         ON CONFLICT (workspace_id) DO UPDATE
           SET balance_credits = merchant_wallet.balance_credits + EXCLUDED.balance_credits,
               balance_vnd = merchant_wallet.balance_vnd + EXCLUDED.balance_vnd,
               tier = EXCLUDED.tier,
               updated_at = NOW()`,
        [workspaceId, credits, amountVnd, nextTier]
      );
      return this.getWallet(workspaceId);
    } catch {
      return this.confirmTopup(workspaceId, 3000, 500000, 'Nạp gói GROWTH');
    }
  }

  async confirmByQrReference(qrReference: string, paidAmountVnd?: number): Promise<{ matched: boolean; workspace_id?: string; credits_added?: number }> {
    const cleanRef = (qrReference || '').trim();
    if (!cleanRef) return { matched: false };
    try {
      const res = await this.db.query(
        `SELECT * FROM merchant_wallet_transactions
         WHERE status = 'pending' AND metadata->>'qr_reference' = $1::text
         ORDER BY created_at DESC LIMIT 1`,
        [cleanRef]
      );
      const tx = res.rows[0];
      if (!tx) return { matched: false };
      if (typeof paidAmountVnd === 'number' && paidAmountVnd > 0 && paidAmountVnd < Number(tx.amount_vnd || 0)) {
        return { matched: false };
      }
      await this.confirmPayment(tx.workspace_id, tx.id);
      return { matched: true, workspace_id: tx.workspace_id, credits_added: Number(tx.credits || 0) };
    } catch {
      return { matched: false };
    }
  }

  async deductCredits(workspaceId: string, credits: number, description: string): Promise<void> {
    if (!workspaceId || credits <= 0) return;
    try {
      await this.db.query(
        `UPDATE merchant_wallet
         SET balance_credits = GREATEST(0, balance_credits - $2::numeric),
             updated_at = NOW()
         WHERE workspace_id = $1::uuid`,
        [workspaceId, credits]
      );
      await this.db.query(
        `INSERT INTO merchant_wallet_transactions (
          workspace_id, tx_type, credits, amount_vnd, description, status
        ) VALUES (
          $1::uuid, 'usage', $2::numeric, 0, $3::varchar, 'success'
        )`,
        [workspaceId, -Math.abs(credits), description.slice(0, 240)]
      );
    } catch {
      // Non-blocking usage metering
    }
  }
}
