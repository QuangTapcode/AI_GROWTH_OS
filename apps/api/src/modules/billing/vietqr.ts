import { randomBytes } from "node:crypto";

/** Mã VietQR động (chuẩn Napas 247) qua dịch vụ ảnh công khai img.vietqr.io. */
export interface VietQrAccount {
  bankBin: string;
  accountNumber: string;
  accountName?: string;
}

export function vietQrImageUrl(account: VietQrAccount, amountVnd: number, addInfo: string): string {
  const params = new URLSearchParams({ amount: String(Math.round(amountVnd)), addInfo: addInfo.slice(0, 50) });
  if (account.accountName) params.set("accountName", account.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(account.bankBin)}-${encodeURIComponent(account.accountNumber)}-compact2.png?${params.toString()}`;
}

/** Mã tham chiếu chuyển khoản: chữ in hoa + số, không ký tự dễ nhầm (0/O, 1/I). */
export function paymentReference(prefix: string, length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${prefix}${out}`;
}

/** Tài khoản nhận tiền nạp ví của nền tảng (env), không bao giờ hardcode. */
export function platformWalletAccount(): VietQrAccount | null {
  const bankBin = process.env.WALLET_BANK_BIN?.trim();
  const accountNumber = process.env.WALLET_BANK_ACCOUNT?.trim();
  if (!bankBin || !accountNumber) return null;
  return { bankBin, accountNumber, accountName: process.env.WALLET_ACCOUNT_NAME?.trim() || undefined };
}
