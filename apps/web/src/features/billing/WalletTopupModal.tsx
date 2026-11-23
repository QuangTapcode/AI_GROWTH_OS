'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

interface WalletState {
  workspace_id: string;
  balance_credits: number;
  balance_vnd: number;
  tier: string;
  transactions?: Array<{
    id: string;
    type: 'topup' | 'usage';
    credits: number;
    amount_vnd: number;
    description: string;
    created_at: string;
  }>;
}

interface WalletTopupModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WalletTopupModal({ workspaceId, isOpen, onClose }: WalletTopupModalProps) {
  const [wallet, setWallet] = useState<WalletState>({
    workspace_id: workspaceId,
    balance_credits: 1200,
    balance_vnd: 250000,
    tier: 'growth',
  });
  const [selectedPackage, setSelectedPackage] = useState<'starter' | 'growth' | 'enterprise'>('growth');
  const [activeTx, setActiveTx] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/wallet`);
        const json = await res.json();
        if (json.ok && json.wallet) {
          setWallet(json.wallet);
        }
      } catch {
        // Ignored
      }
    }
    load();
  }, [workspaceId, isOpen]);

  const handleCreateOrder = async () => {
    setIsLoading(true);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/wallet/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_name: selectedPackage }),
      });
      const json = await res.json();
      if (json.ok && json.transaction) {
        setActiveTx(json.transaction);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPaid = async () => {
    if (!activeTx) return;
    setIsConfirming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/wallet/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: activeTx.id }),
      });
      const json = await res.json();
      if (json.ok && json.wallet) {
        setWallet(json.wallet);
        setSuccessMsg('🎉 Nạp tiền thành công! Tín dụng đã được cộng ngay tức thì vào ví.');
        setActiveTx(null);
      }
    } catch {
      // Ignored
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">💳</div>
            <div>
              <h3 className="font-bold text-base">Ví Tín Dụng Marketing (Top-up Wallet)</h3>
              <p className="text-xs text-emerald-200 mt-0.5">Nạp credit trả trước phục vụ các Agent tự hành 24/7</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Balance */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Số Dư Tín Dụng Hiện Tại</span>
              <div className="text-2xl font-black text-emerald-950 mt-0.5">
                {wallet.balance_credits.toLocaleString('vi-VN')} <span className="text-sm font-normal text-emerald-700">credits</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Giá Trị Tương Đương</span>
              <div className="text-base font-bold text-emerald-900">
                ~{wallet.balance_vnd.toLocaleString('vi-VN')} đ
              </div>
            </div>
          </div>

          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold">
              {successMsg}
            </div>
          )}

          {!activeTx ? (
            <>
              {/* Package Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Chọn Gói Nạp Tín Dụng
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Starter */}
                  <div
                    onClick={() => setSelectedPackage('starter')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedPackage === 'starter'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900">Khởi Động</div>
                    <div className="text-sm font-black text-emerald-700 mt-1">200.000 đ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">+1.000 credits</div>
                  </div>

                  {/* Growth */}
                  <div
                    onClick={() => setSelectedPackage('growth')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all relative ${
                      selectedPackage === 'growth'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500 text-white">
                      Phổ biến
                    </span>
                    <div className="text-xs font-bold text-slate-900">Tăng Trưởng</div>
                    <div className="text-sm font-black text-emerald-700 mt-1">500.000 đ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">+3.000 credits</div>
                  </div>

                  {/* Enterprise */}
                  <div
                    onClick={() => setSelectedPackage('enterprise')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedPackage === 'enterprise'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900">Doanh Nghiệp</div>
                    <div className="text-sm font-black text-emerald-700 mt-1">1.500.000 đ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">+10.000 credits</div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleCreateOrder}
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-60"
                >
                  {isLoading ? 'Đang tạo mã thanh toán...' : 'Tạo Mã VietQR Thanh Toán'}
                </button>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                ⚡ <strong>Cơ chế tính phí SaaS:</strong> Mỗi lượt AI Agent tạo bài viết, biên tập nội dung hoặc phản hồi tự động tiêu thụ <strong>1 credit</strong>. Số dư được trừ trực tiếp vào ví của doanh nghiệp này.
              </div>

              {wallet.transactions && wallet.transactions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Lịch Sử Nạp &amp; Tiêu Thụ Credit Gần Đây
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {wallet.transactions.slice(0, 6).map((tx) => (
                      <div key={tx.id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-800 truncate">{tx.description}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(tx.created_at).toLocaleString('vi-VN')}
                          </div>
                        </div>
                        <span
                          className={`font-bold shrink-0 ${
                            tx.type === 'topup' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.type === 'topup' ? `+${Math.abs(tx.credits)}` : `-${Math.abs(tx.credits)}`} cr
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* VietQR Payment Screen */
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 inline-block">
                <img
                  src={activeTx.vietqr_image_url}
                  alt="VietQR Transfer"
                  className="w-48 h-48 mx-auto rounded-lg shadow-sm"
                />
                <div className="text-xs font-bold text-slate-900 mt-2">
                  Số tiền: {activeTx.amount_vnd.toLocaleString('vi-VN')} VNĐ
                </div>
                <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                  Nội dung CK: <span className="font-bold text-emerald-700">{activeTx.qr_reference}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Mở ứng dụng ngân hàng bất kỳ (Vietcombank, MB, Techcombank, Momo) quét mã QR để thanh toán một chạm.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setActiveTx(null)}
                  className="w-1/2 py-2.5 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Chọn Lại Gói
                </button>
                <button
                  onClick={handleConfirmPaid}
                  disabled={isConfirming}
                  className="w-1/2 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                >
                  {isConfirming ? 'Đang kiểm tra...' : '✓ Xác Nhận Đã Chuyển Tiền'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

