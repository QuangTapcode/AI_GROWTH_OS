"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { formatDateTimeVn, merchantApi, type OnboardingState } from "@/lib/merchantApi";
import { Button, Card, LoadingBlock, Notice, Pill, useAction, useLoader } from "@/features/merchant/ui";

interface ZeroTechOnboardingProps {
  workspaceId: string;
  onCompleted?: () => void;
}

const FIELDS = [
  { key: "fanpage_url", label: "Link Fanpage Facebook", placeholder: "https://facebook.com/ten-quan", help: "Mở Fanpage → sao chép địa chỉ trên trình duyệt." },
  { key: "gmaps_url", label: "Link Google Maps của quán", placeholder: "https://maps.app.goo.gl/…", help: "Trên Google Maps bấm Chia sẻ → Sao chép đường liên kết." },
  { key: "gdrive_url", label: "Thư mục Google Drive chứa ảnh món", placeholder: "https://drive.google.com/drive/folders/…", help: "Tạo thư mục, bỏ ảnh chụp món vào, bấm Chia sẻ → Bất kỳ ai có đường liên kết." },
  { key: "community_group_url", label: "Link Group Facebook hoặc nhóm Zalo (không bắt buộc)", placeholder: "https://facebook.com/groups/… hoặc https://zalo.me/g/…", help: "Nhóm khách quen để Agent 8 nuôi cộng đồng." },
] as const;

const AGENT_TONE = { active: "green", needs_connection: "amber", not_activated: "slate" } as const;
const AGENT_LABEL = { active: "Đang làm việc", needs_connection: "Cần kết nối", not_activated: "Chưa kích hoạt" } as const;

/** Form 4 link; khởi tạo từ dữ liệu đã lưu (component được key theo lần cập nhật để luôn đồng bộ). */
function LinksForm({ workspaceId, state, onSaved }: { workspaceId: string; state: OnboardingState | null; onSaved: (s: OnboardingState) => void }) {
  const { busy, notice, setNotice, run } = useAction();
  const [form, setForm] = useState({
    business_name: state?.business_name ?? "",
    fanpage_url: state?.fanpage_url ?? "",
    gmaps_url: state?.gmaps_url ?? "",
    gdrive_url: state?.gdrive_url ?? "",
    community_group_url: state?.community_group_url ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    void run("activate", async () => {
      try {
        onSaved(await merchantApi.activate(workspaceId, form));
        return "Đã kích hoạt! Các agent sẽ bắt đầu làm việc trong vòng 1 phút.";
      } catch (err) {
        if (err instanceof ApiError && err.fieldErrors) {
          setFieldErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
          throw new Error("Có link chưa đúng, vui lòng kiểm tra các ô được đánh dấu đỏ.", { cause: err });
        }
        throw err;
      }
    });
  };

  return (
      <Card title="Kết nối quán của bạn" subtitle="Chỉ cần dán 4 đường link và bấm Kích hoạt — không cần biết về công nghệ.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block text-sm font-semibold text-slate-800">
            Tên quán
            <input
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              placeholder="Ví dụ: Bún Chả Cá Bà Lữ"
              className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-normal ${fieldErrors.business_name ? "border-rose-400" : "border-slate-200"}`}
            />
            {fieldErrors.business_name && <span className="text-xs text-rose-700 font-normal">{fieldErrors.business_name}</span>}
          </label>
          {FIELDS.map((f, i) => (
            <label key={f.key} className="block text-sm font-semibold text-slate-800">
              <span className="inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold inline-flex items-center justify-center">{i + 1}</span>
                {f.label}
              </span>
              <input
                type="url"
                inputMode="url"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-normal ${fieldErrors[f.key] ? "border-rose-400" : "border-slate-200"}`}
              />
              <span className={`block text-xs font-normal mt-1 ${fieldErrors[f.key] ? "text-rose-700" : "text-slate-500"}`}>{fieldErrors[f.key] ?? f.help}</span>
            </label>
          ))}
          <Notice notice={notice} onClose={() => setNotice(null)} />
          <div className="flex flex-wrap gap-2 items-center">
            <Button type="submit" busy={busy === "activate"}>
              {state?.onboarding_completed ? "Lưu & kích hoạt lại" : "Kích hoạt Phòng Marketing AI"}
            </Button>
            <Link href="/merchant-settings" className="text-xs font-semibold text-blue-700">
              Cài đặt quán (giờ mở cửa, thực đơn, cọc, báo cáo) →
            </Link>
          </div>
        </form>
      </Card>
  );
}

/** Zero-Tech Onboarding: dán 4 link, bấm Kích hoạt. Trạng thái 8 agent hiển thị đúng thực tế kết nối. */
export function ZeroTechOnboarding({ workspaceId, onCompleted }: ZeroTechOnboardingProps) {
  const { data: state, error, loading, setData } = useLoader(() => merchantApi.onboarding(workspaceId), [workspaceId]);

  if (loading && !state) return <LoadingBlock />;
  if (error && !state) return <Notice notice={{ kind: "error", text: error }} />;

  return (
    <div className="space-y-5">
      {state?.onboarding_completed && state.welcome_message && (
        <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-700 text-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">AI Growth Lead</p>
          <p className="mt-2 text-sm leading-relaxed">{state.welcome_message}</p>
          <p className="mt-2 text-[11px] text-blue-100">Kích hoạt lúc {formatDateTimeVn(state.activated_at)}</p>
        </div>
      )}

      <LinksForm
        key={state?.updated_at ?? "new"}
        workspaceId={workspaceId}
        state={state}
        onSaved={(next) => {
          setData(next);
          onCompleted?.();
        }}
      />

      {state && (
        <Card title="Đội 8 chuyên viên AI" subtitle="Trạng thái thật theo kết nối của quán. Mục “Cần kết nối” cho biết còn thiếu gì.">
          <ul className="grid gap-3 md:grid-cols-2">
            {state.active_agents.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{a.role}</p>
                  <Pill tone={AGENT_TONE[a.status]}>{AGENT_LABEL[a.status]}</Pill>
                </div>
                <p className="text-xs text-slate-600 mt-1">{a.detail}</p>
                {a.last_run_at && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Chạy gần nhất {formatDateTimeVn(a.last_run_at)} · {a.last_run_status}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
