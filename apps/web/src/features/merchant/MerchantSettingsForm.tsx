"use client";

import React, { useState } from "react";
import { merchantApi, type MenuItem, type MerchantSettings, type OnboardingState } from "@/lib/merchantApi";
import { Button, Card, LoadingBlock, Notice, useAction, useLoader } from "./ui";

const input = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal";
const label = "block text-xs font-semibold text-slate-700";

/** Dòng "Tên món | giá | nhóm | mô tả" ↔ MenuItem (nhập nhanh như ghi sổ). */
function menuToText(menu: MenuItem[] = []): string {
  return menu.map((m) => [m.name, m.price_vnd ?? "", m.category ?? "", m.description ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
}
function textToMenu(text: string): MenuItem[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((p) => p.trim()))
    .filter((p) => p[0])
    .map(([name, price, category, description]) => ({
      name,
      ...(price && /^\d+$/.test(price.replace(/[.,\s]/g, "")) ? { price_vnd: Number(price.replace(/[.,\s]/g, "")) } : {}),
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
    }));
}
function faqToText(faq: MerchantSettings["faq"] = []): string {
  return faq.map((f) => `${f.question} => ${f.answer}`).join("\n");
}
function textToFaq(text: string): NonNullable<MerchantSettings["faq"]> {
  return text
    .split("\n")
    .map((l) => l.split("=>").map((p) => p.trim()))
    .filter((p) => p[0] && p[1])
    .map(([question, answer]) => ({ question, answer }));
}

/** Hồ sơ vận hành quán — nguồn sự thật duy nhất để agent trả lời giá, giờ, cọc (không bịa). */
export function MerchantSettingsForm({ workspaceId }: { workspaceId: string }) {
  const { data, error, loading, setData } = useLoader(() => merchantApi.onboarding(workspaceId), [workspaceId]);
  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <Notice notice={{ kind: "error", text: error }} />;
  if (!data) return null;
  return <SettingsEditor key={data.updated_at ?? "new"} workspaceId={workspaceId} initial={data.settings} onSaved={setData} />;
}

function SettingsEditor({ workspaceId, initial, onSaved }: { workspaceId: string; initial: MerchantSettings; onSaved: (s: OnboardingState) => void }) {
  const { busy, notice, setNotice, run } = useAction();
  const [s, setS] = useState<MerchantSettings>(initial);
  const [menuText, setMenuText] = useState(() => menuToText(initial.menu));
  const [faqText, setFaqText] = useState(() => faqToText(initial.faq));
  const [keywords, setKeywords] = useState(() => (initial.seo_keywords ?? []).join(", "));

  const set = <K extends keyof MerchantSettings>(key: K, value: MerchantSettings[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      const body: MerchantSettings = {
        ...s,
        menu: textToMenu(menuText),
        faq: textToFaq(faqText),
        seo_keywords: keywords.split(",").map((k) => k.trim()).filter((k) => k.length >= 2),
      };
      for (const key of Object.keys(body) as Array<keyof MerchantSettings>) {
        if (body[key] === "" || body[key] === undefined) delete body[key];
      }
      onSaved(await merchantApi.updateSettings(workspaceId, body));
      return "Đã lưu hồ sơ quán. Các agent dùng thông tin mới ngay từ lượt sau.";
    });
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Card title="Thông tin quán" subtitle="Agent chỉ được nói đúng những gì có ở đây.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Tên quán
            <input className={input} value={s.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} />
          </label>
          <label className={label}>
            Hotline
            <input className={input} inputMode="tel" value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Địa chỉ
            <input className={input} value={s.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </label>
          <label className={label}>
            Quận/ khu vực
            <input className={input} value={s.district ?? ""} onChange={(e) => set("district", e.target.value)} placeholder="Hải Châu" />
          </label>
          <label className={label}>
            Thành phố
            <input className={input} value={s.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Đà Nẵng" />
          </label>
          <label className={label}>
            Giờ mở cửa
            <input className={input} type="time" value={s.opening_hours?.open ?? ""} onChange={(e) => set("opening_hours", { open: e.target.value, close: s.opening_hours?.close ?? "22:00" })} />
          </label>
          <label className={label}>
            Giờ đóng cửa
            <input className={input} type="time" value={s.opening_hours?.close ?? ""} onChange={(e) => set("opening_hours", { open: s.opening_hours?.open ?? "10:00", close: e.target.value })} />
          </label>
          <label className={label}>
            Số khách tối đa một bàn đặt
            <input className={input} type="number" min={1} value={s.max_party_size ?? ""} onChange={(e) => set("max_party_size", e.target.value ? Number(e.target.value) : undefined)} />
          </label>
          <label className={label}>
            Gửi xe
            <input className={input} value={s.parking_note ?? ""} onChange={(e) => set("parking_note", e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title="Thực đơn & giá" subtitle="Mỗi dòng: Tên món | giá (số) | nhóm | mô tả. Ví dụ: Bún chả cá | 45000 | Món chính | Chả cá thu nhà làm">
        <textarea className={`${input} font-mono`} rows={8} value={menuText} onChange={(e) => setMenuText(e.target.value)} aria-label="Thực đơn" />
      </Card>

      <Card title="Hỏi đáp thường gặp" subtitle="Mỗi dòng: Câu hỏi => Câu trả lời">
        <textarea className={input} rows={5} value={faqText} onChange={(e) => setFaqText(e.target.value)} aria-label="Hỏi đáp" />
      </Card>

      <Card title="Đặt bàn & tiền cọc">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Cọc khi bàn từ (khách)
            <input className={input} type="number" min={1} value={s.deposit?.required_from_party_size ?? ""} onChange={(e) => set("deposit", { ...(s.deposit ?? { amount_per_guest_vnd: 0 }), required_from_party_size: Number(e.target.value) })} />
          </label>
          <label className={label}>
            Cọc mỗi khách (đ)
            <input className={input} type="number" min={0} step={1000} value={s.deposit?.amount_per_guest_vnd ?? ""} onChange={(e) => set("deposit", { ...(s.deposit ?? { required_from_party_size: 8 }), amount_per_guest_vnd: Number(e.target.value) })} />
          </label>
          <label className={label}>
            Mã ngân hàng (BIN Napas)
            <input className={input} value={s.deposit?.bank_bin ?? ""} onChange={(e) => set("deposit", { ...(s.deposit ?? { required_from_party_size: 8, amount_per_guest_vnd: 0 }), bank_bin: e.target.value })} placeholder="970436" />
          </label>
          <label className={label}>
            Số tài khoản nhận cọc
            <input className={input} value={s.deposit?.bank_account ?? ""} onChange={(e) => set("deposit", { ...(s.deposit ?? { required_from_party_size: 8, amount_per_guest_vnd: 0 }), bank_account: e.target.value })} />
          </label>
          <label className={label}>
            Tên chủ tài khoản
            <input className={input} value={s.deposit?.account_name ?? ""} onChange={(e) => set("deposit", { ...(s.deposit ?? { required_from_party_size: 8, amount_per_guest_vnd: 0 }), account_name: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:mt-6">
            <input type="checkbox" className="accent-blue-700" checked={s.auto_confirm_bookings ?? false} onChange={(e) => set("auto_confirm_bookings", e.target.checked)} />
            Bot tự xác nhận giữ bàn (không cần nhân viên)
          </label>
        </div>
      </Card>

      <Card title="Marketing & báo cáo">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Từ khóa SEO địa phương (cách nhau bởi dấu phẩy)
            <input className={input} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="bún chả cá Đà Nẵng, quán ăn Hải Châu" />
          </label>
          <label className={label}>
            Telegram chat ID nhận báo cáo & cảnh báo
            <input className={input} value={s.telegram_chat_id ?? ""} onChange={(e) => set("telegram_chat_id", e.target.value)} />
          </label>
          <label className={label}>
            Email nhận báo cáo
            <input className={input} type="email" value={s.report_email ?? ""} onChange={(e) => set("report_email", e.target.value)} />
          </label>
          <label className={label}>
            Giờ gửi báo cáo tối
            <input className={input} type="number" min={0} max={23} value={s.report_hour_local ?? 21} onChange={(e) => set("report_hour_local", Number(e.target.value))} />
          </label>
          <label className={label}>
            Tự trả lời review Google từ (sao)
            <select className={input} value={s.gmaps_auto_reply_min_rating ?? 4} onChange={(e) => set("gmaps_auto_reply_min_rating", Number(e.target.value))}>
              <option value={4}>4★ trở lên (khuyên dùng)</option>
              <option value={5}>Chỉ 5★</option>
              <option value={6}>Không tự trả lời — luôn chờ duyệt</option>
            </select>
          </label>
          <label className={label}>
            Mục tiêu thành viên nhóm
            <input className={input} type="number" min={10} value={s.community_target_members ?? 1000} onChange={(e) => set("community_target_members", Number(e.target.value))} />
          </label>
          <label className={label}>
            Link nhóm Zalo khách quen (nếu có)
            <input className={input} type="url" value={s.zalo_group_url ?? ""} onChange={(e) => set("zalo_group_url", e.target.value)} />
          </label>
          <label className={label}>
            Link logo (watermark ảnh)
            <input className={input} type="url" value={s.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} placeholder="hoặc bỏ ảnh tên logo.png vào thư mục Drive" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" className="accent-blue-700" checked={s.auto_publish_calendar ?? false} onChange={(e) => set("auto_publish_calendar", e.target.checked)} />
            Tự duyệt lịch đăng do AI lập (không khuyến nghị)
          </label>
        </div>
      </Card>

      <Notice notice={notice} onClose={() => setNotice(null)} />
      <Button type="submit" busy={busy === "save"}>
        Lưu hồ sơ quán
      </Button>
    </form>
  );
}
