"use client";

import React from "react";
import { formatDateTimeVn, merchantApi } from "@/lib/merchantApi";
import { Card, LoadingBlock, Notice, Pill, Stat, useLoader } from "@/features/merchant/ui";

const STATUS = {
  ahead: { label: "Vượt kế hoạch", tone: "green" },
  on_track: { label: "Đúng tiến độ", tone: "blue" },
  behind: { label: "Chậm tiến độ", tone: "red" },
  not_measured: { label: "Chưa đo số thành viên", tone: "amber" },
  not_activated: { label: "Chưa kích hoạt", tone: "slate" },
} as const;

/** Agent 8 — phễu 0 → 1.000 thành viên nhóm khách quen: thực tế (từ đồng bộ Group) so với kế hoạch 12 tuần. */
export function CommunityFunnel({ workspaceId }: { workspaceId: string }) {
  const { data: f, error, loading } = useLoader(() => merchantApi.funnel(workspaceId), [workspaceId]);
  if (loading && !f) return <LoadingBlock />;
  if (error && !f) return <Notice notice={{ kind: "error", text: error }} />;
  if (!f) return null;
  const s = STATUS[f.status];
  const max = f.target_members;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Thành viên hiện tại" value={f.current_members ?? "—"} hint={f.measured_at ? `đo lúc ${formatDateTimeVn(f.measured_at)}` : "Group Bot chưa đồng bộ"} />
        <Stat label="Kế hoạch tới hôm nay" value={f.planned_members_now ?? "—"} hint={f.current_week ? `tuần ${f.current_week}/12` : undefined} />
        <Stat label="Mục tiêu" value={f.target_members.toLocaleString("vi-VN")} />
        <Stat label="Cần thêm mỗi tuần" value={f.members_needed_per_week ?? "—"} />
      </div>
      <Card title="Tiến độ phễu cộng đồng" actions={<Pill tone={s.tone}>{s.label}</Pill>}>
        <div className="space-y-2" aria-label="Kế hoạch theo tuần">
          {f.milestones.map((m) => {
            const reached = f.current_members !== null && f.current_members >= m.planned;
            return (
              <div key={m.week} className="flex items-center gap-3 text-xs">
                <span className="w-14 text-slate-500 shrink-0">Tuần {m.week}</span>
                <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${reached ? "bg-emerald-500" : "bg-blue-300"}`} style={{ width: `${Math.round((m.planned / max) * 100)}%` }} />
                </div>
                <span className="w-16 text-right tabular-nums text-slate-700 shrink-0">{m.planned.toLocaleString("vi-VN")}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Điểm chạm kéo khách vào nhóm (7 ngày qua)" subtitle="Các điểm chạm này đều do agent làm tự động.">
        <ul className="grid gap-3 sm:grid-cols-3 text-sm">
          <li className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{f.touchpoints_7d.comment_invites}</p>
            <p className="text-xs text-slate-500">lời mời gửi kèm trả lời bình luận (Agent 6, tối đa 10–15/ngày)</p>
          </li>
          <li className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{f.touchpoints_7d.booking_invites}</p>
            <p className="text-xs text-slate-500">khách đặt bàn được mời vào nhóm (Agent 7)</p>
          </li>
          <li className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{f.touchpoints_7d.group_posts_published}</p>
            <p className="text-xs text-slate-500">bài mini game/ bình chọn đã đăng trong nhóm (Agent 3/4)</p>
          </li>
        </ul>
      </Card>
      {f.table_qr_url && (
        <Card title="Mã QR đặt trên bàn ăn" subtitle="In mã này đặt trên bàn: khách quét để vào nhóm khách quen.">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={f.table_qr_url} alt="Mã QR vào nhóm khách quen" className="w-40 h-40 rounded-lg border border-slate-200" />
            <div className="text-xs text-slate-600 space-y-2">
              <p className="break-all">{f.group_url}</p>
              <a href={f.table_qr_url} target="_blank" rel="noreferrer" className="inline-block font-semibold text-blue-700">
                Mở ảnh QR để in
              </a>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
