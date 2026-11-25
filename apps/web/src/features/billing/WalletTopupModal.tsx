"use client";

import React, { useEffect, useState } from "react";
import { formatVnd, merchantApi, type WalletState, type WalletTransaction } from "@/lib/merchantApi";
import { Button, Notice, Pill, errorMessage, useAction } from "@/features/merchant/ui";

interface WalletTopupModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Ví credit trả trước: số dư thật, 3 gói nạp một chạm, mã VietQR động (Napas 247).
 * Credit chỉ được cộng khi ngân hàng xác nhận (webhook); nút "Xác nhận thử" chỉ hiện ở môi trường thử nghiệm.
 */
export function WalletTopupModal({ workspaceId, isOpen, onClose }: WalletTopupModalProps) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<WalletTransaction | null>(null);
  const { busy, notice, setNotice, run } = useAction();

  useEffect(() => {
    if (!isOpen) return;
    merchantApi
      .wallet(workspaceId)
      .then((w) => {
        setWallet(w);
        setLoadError(null);
        setPending(null);
        setNotice(null);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [isOpen, workspaceId, setNotice]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Đang chờ chuyển khoản: hỏi lại số dư mỗi 5 giây để thấy credit được cộng ngay khi ngân hàng báo.
  useEffect(() => {
    if (!isOpen || !pending) return;
    const timer = setInterval(async () => {
      try {
        const w = await merchantApi.wallet(workspaceId);
        setWallet(w);
        if (w.transactions.find((t) => t.id === pending.id)?.status === "success") {
          setPending(null);
          setNotice({ kind: "ok", text: `Đã nhận thanh toán, cộng ${pending.credits.toLocaleString("vi-VN")} credit.` });
        }
      } catch {
        // giữ nguyên, lần sau thử lại
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isOpen, pending, workspaceId, setNotice]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Ví AI">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <header className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Ví AI của quán</h2>
            <p className="text-xs text-slate-500 mt-1">Mỗi lần agent dùng AI thành công trừ 1 credit.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-lg" aria-label="Đóng">
            ✕
          </button>
        </header>
        <div className="p-5 space-y-4">
          {loadError && <Notice notice={{ kind: "error", text: loadError }} />}
          <Notice notice={notice} onClose={() => setNotice(null)} />
          {wallet && (
            <>
              <div className="rounded-xl bg-slate-900 text-white p-4">
                <p className="text-xs text-slate-300">Số dư</p>
                <p className="text-3xl font-bold tabular-nums">{wallet.balance_credits.toLocaleString("vi-VN")} credit</p>
                <p className="text-xs text-slate-300 mt-1">Đã dùng 7 ngày qua: {wallet.credits_used_7d.toLocaleString("vi-VN")} credit</p>
              </div>

              {!pending && (
                <>
                  {!wallet.payment_configured && (
                    <Notice notice={{ kind: "error", text: "Máy chủ chưa cấu hình tài khoản nhận tiền (WALLET_BANK_BIN / WALLET_BANK_ACCOUNT) nên chưa tạo được mã QR." }} />
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {wallet.packages.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!wallet.payment_configured || busy !== null}
                        onClick={() =>
                          run(`topup-${p.id}`, async () => {
                            setPending(await merchantApi.topup(workspaceId, p.id));
                          })
                        }
                        className="text-left rounded-xl border border-slate-200 p-3 hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <p className="text-xs font-semibold text-slate-600">{p.label}</p>
                        <p className="text-lg font-bold text-slate-900">{formatVnd(p.amount_vnd)}</p>
                        <p className="text-xs text-emerald-700 font-semibold">{p.credits.toLocaleString("vi-VN")} credit</p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {pending && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Quét mã để chuyển {formatVnd(pending.amount_vnd)}
                  </p>
                  {pending.vietqr_image_url && (
                    <img src={pending.vietqr_image_url} alt={`Mã VietQR nạp ${formatVnd(pending.amount_vnd)}`} className="mx-auto w-56 h-auto rounded-lg bg-white" />
                  )}
                  <p className="text-xs text-slate-600">
                    Nội dung chuyển khoản bắt buộc: <strong className="font-mono text-slate-900">{pending.qr_reference}</strong>
                  </p>
                  <p className="text-[11px] text-slate-500">Credit được cộng tự động khi ngân hàng xác nhận. Mã hết hạn sau 24 giờ.</p>
                  <div className="flex justify-center gap-2">
                    <Button variant="secondary" onClick={() => setPending(null)}>
                      Chọn gói khác
                    </Button>
                    {wallet.manual_confirm_enabled && (
                      <Button
                        busy={busy === "confirm"}
                        onClick={() =>
                          run("confirm", async () => {
                            setWallet(await merchantApi.confirmTopup(workspaceId, pending.id));
                            setPending(null);
                            return "Đã xác nhận thử (môi trường thử nghiệm) và cộng credit.";
                          })
                        }
                      >
                        Xác nhận thử (staging)
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {wallet.transactions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">Giao dịch gần đây</p>
                  <ul className="divide-y divide-slate-100 text-xs">
                    {wallet.transactions.slice(0, 6).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-slate-600">
                          {new Date(t.created_at).toLocaleString("vi-VN")} · {formatVnd(t.amount_vnd)} · <span className="font-mono">{t.qr_reference}</span>
                        </span>
                        <Pill tone={t.status === "success" ? "green" : t.status === "pending" ? "amber" : "slate"}>
                          {t.status === "success" ? "Đã cộng" : t.status === "pending" ? "Chờ thanh toán" : t.status === "expired" ? "Hết hạn" : "Lỗi"}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
