"use client";

import React, { useEffect, useState } from "react";
import { formatDateTimeVn, formatVnd, merchantApi, type BookingLead } from "@/lib/merchantApi";
import { Button, Card, EmptyState, LoadingBlock, Notice, Pill, Stat, useAction, useLoader } from "@/features/merchant/ui";

const STATUS: Record<BookingLead["status"], { label: string; tone: "amber" | "green" | "red" | "slate" | "blue" }> = {
  pending: { label: "Chờ xác nhận", tone: "amber" },
  confirmed: { label: "Đã xác nhận", tone: "green" },
  cancelled: { label: "Đã hủy", tone: "red" },
  completed: { label: "Đã đến", tone: "blue" },
  no_show: { label: "Không đến", tone: "slate" },
};
const PLATFORM: Record<string, string> = { facebook: "Messenger", instagram: "Instagram", zalo: "Zalo", telegram: "Telegram", phone: "Điện thoại", walk_in: "Khách vãng lai", web: "Website", messenger: "Messenger" };

/** Booking Hub cho nhân viên quán: đặt bàn do Agent 7 chốt qua tin nhắn + nhập tay; xác nhận gửi tin lại cho khách. */
export function BookingLeadsHub({ workspaceId }: { workspaceId: string }) {
  const [filter, setFilter] = useState<string>("");
  const { data, error, loading, reload } = useLoader(() => merchantApi.bookings(workspaceId, filter || undefined), [workspaceId, filter]);
  const { busy, notice, setNotice, run } = useAction();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", party_size: 2, booking_time: "", special_notes: "" });

  // Đặt bàn qua tin nhắn đến bất cứ lúc nào: làm mới mỗi 30 giây.
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const update = (lead: BookingLead, body: Record<string, unknown>, text: string) =>
    run(`${lead.id}-${String(body.status ?? body.deposit_status)}`, async () => {
      await merchantApi.updateBooking(workspaceId, lead.id, body);
      await reload();
      return text;
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Chờ xác nhận" value={data?.summary.pending ?? "—"} />
        <Stat label="Bàn hôm nay" value={data?.summary.confirmed_today ?? "—"} />
        <Stat label="Khách hôm nay" value={data?.summary.guests_today ?? "—"} />
      </div>
      <Card
        title="Đặt bàn"
        subtitle="Agent 7 tư vấn và giữ bàn qua Messenger / Instagram / Zalo; nhân viên bấm Xác nhận để báo lại cho khách."
        actions={
          <>
            <select aria-label="Lọc trạng thái" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
              <option value="">Tất cả</option>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Đóng" : "+ Nhập đặt bàn"}
            </Button>
          </>
        }
      >
        <Notice notice={notice} onClose={() => setNotice(null)} />
        {showForm && (
          <form
            className="grid gap-3 sm:grid-cols-5 items-end mb-4 rounded-xl bg-slate-50 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run("create", async () => {
                await merchantApi.createBooking(workspaceId, {
                  customer_name: form.customer_name,
                  ...(form.customer_phone ? { customer_phone: form.customer_phone } : {}),
                  party_size: Number(form.party_size),
                  booking_time: new Date(form.booking_time).toISOString(),
                  ...(form.special_notes ? { special_notes: form.special_notes } : {}),
                  platform: "phone",
                });
                setShowForm(false);
                setForm({ customer_name: "", customer_phone: "", party_size: 2, booking_time: "", special_notes: "" });
                await reload();
                return "Đã thêm đặt bàn.";
              });
            }}
          >
            <label className="text-xs font-semibold text-slate-600">
              Tên khách
              <input required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Số điện thoại
              <input inputMode="tel" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Số người
              <input type="number" min={1} max={500} required value={form.party_size} onChange={(e) => setForm({ ...form, party_size: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Thời gian
              <input type="datetime-local" required value={form.booking_time} onChange={(e) => setForm({ ...form, booking_time: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <Button type="submit" busy={busy === "create"}>
              Lưu
            </Button>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-5">
              Ghi chú
              <input value={form.special_notes} onChange={(e) => setForm({ ...form, special_notes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
          </form>
        )}
        {loading && !data && <LoadingBlock />}
        {error && <Notice notice={{ kind: "error", text: error }} />}
        {data && data.leads.length === 0 && <EmptyState>Chưa có đặt bàn nào. Khi khách nhắn “đặt bàn” vào Fanpage, Agent 7 sẽ tự hỏi thông tin và đưa yêu cầu vào đây.</EmptyState>}
        {data && data.leads.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {data.leads.map((lead) => {
              const s = STATUS[lead.status];
              return (
                <li key={lead.id} className="py-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {lead.customer_name} · {lead.party_size} người · {formatDateTimeVn(lead.booking_time)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {lead.customer_phone ?? "—"} · {PLATFORM[lead.platform] ?? lead.platform}
                      {lead.special_notes ? ` · ${lead.special_notes}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      {lead.deposit_amount > 0 && (
                        <Pill tone={lead.deposit_status === "paid" ? "green" : "amber"}>
                          Cọc {formatVnd(lead.deposit_amount)} · {lead.deposit_status === "paid" ? "đã nhận" : "chưa nhận"}
                          {lead.deposit_reference ? ` · ${lead.deposit_reference}` : ""}
                        </Pill>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lead.status === "pending" && (
                      <Button busy={busy === `${lead.id}-confirmed`} onClick={() => update(lead, { status: "confirmed" }, "Đã xác nhận và báo khách.")}>
                        Xác nhận
                      </Button>
                    )}
                    {lead.deposit_amount > 0 && lead.deposit_status === "unpaid" && (
                      <Button variant="secondary" busy={busy === `${lead.id}-paid`} onClick={() => update(lead, { deposit_status: "paid", notify_customer: false }, "Đã ghi nhận tiền cọc.")}>
                        Đã nhận cọc
                      </Button>
                    )}
                    {lead.status === "confirmed" && (
                      <>
                        <Button variant="secondary" busy={busy === `${lead.id}-completed`} onClick={() => update(lead, { status: "completed", notify_customer: false }, "Đã đánh dấu khách đã đến.")}>
                          Khách đã đến
                        </Button>
                        <Button variant="secondary" busy={busy === `${lead.id}-no_show`} onClick={() => update(lead, { status: "no_show", notify_customer: false }, "Đã đánh dấu không đến.")}>
                          Không đến
                        </Button>
                      </>
                    )}
                    {(lead.status === "pending" || lead.status === "confirmed") && (
                      <Button variant="danger" busy={busy === `${lead.id}-cancelled`} onClick={() => update(lead, { status: "cancelled" }, "Đã hủy và báo khách.")}>
                        Hủy
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
