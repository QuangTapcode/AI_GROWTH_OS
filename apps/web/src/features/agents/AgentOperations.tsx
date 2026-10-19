"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { apiRequest, growthApi } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import { ErrorBlock, LoadingBlock } from "@/features/shell/StatusViews";
import type { WorkflowTask } from "@/lib/apiTypes";
import styles from "./AgentOperations.module.css";

type Settings = {
  enabled: boolean;
  interval_hours: number;
  cta: string;
  next_run_at: string;
  last_tick_at: string | null;
  last_error: string | null;
};
type Task = Pick<
  WorkflowTask,
  | "id"
  | "role"
  | "operation"
  | "status"
  | "created_at"
  | "result_ref"
  | "error_details"
> & {
  synthetic?: boolean;
  started_at?: string;
  completed_at?: string;
  queue_status?: string;
  attempts?: number;
  error_code?: string;
};
type Snapshot = {
  settings: Settings | null;
  tasks: Task[];
  observed_at: string;
};
const roles = [
  ["research", "Research & Trend", "Nghiên cứu và tìm cơ hội"],
  ["growth_lead", "Growth Lead", "Chiến lược, campaign và learning"],
  ["seo", "SEO Worker", "Bài viết, title, meta và nguồn"],
  ["content", "Content Marketing", "Social pack, caption và CTA"],
  ["community", "Community", "Phản hồi và đề xuất lead"],
  ["performance", "Performance", "Đo lường và báo cáo"],
] as const;
const labels: Record<string, string> = {
  queued: "Trong hàng đợi",
  pending: "Chờ phụ thuộc",
  running: "Đang chạy",
  awaiting_approval: "Chờ duyệt",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};
function date(value?: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "—";
}
function badge(status?: string) {
  return status === "running"
    ? "bg-blue-100 text-blue-800"
    : status === "failed"
      ? "bg-red-100 text-red-800"
      : status === "awaiting_approval"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-700";
}

function Operations() {
  const { workspace, workspaces, selectWorkspace, canApprove } = useWorkspace();
  const { data, error, loading, reload } = useApiData(workspace.id, (signal) =>
    apiRequest<Snapshot>(`/workspaces/${workspace.id}/automation`, { signal }),
  );
  const [interval, setIntervalHours] = useState(24);
  const [cta, setCta] = useState("Contact our team");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("all");
  const [selected, setSelected] = useState<Task | null>(null);
  useEffect(() => {
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [reload]);
  // Hydrate inputs once; polling must never overwrite an owner's unsaved edits.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!data || hydrated) return;
    if (data.settings) {
      setIntervalHours(data.settings.interval_hours);
      setCta(data.settings.cta);
    }
    setHydrated(true);
  }, [data, hydrated]);
  async function save(enabled: boolean, run_now = false) {
    setBusy(true);
    setMessage("");
    try {
      await apiRequest(`/workspaces/${workspace.id}/automation`, {
        method: "PUT",
        body: { enabled, interval_hours: interval, cta, run_now },
      });
      setMessage(
        run_now
          ? "Đã yêu cầu chạy. Worker sẽ nhận task trong hàng đợi."
          : "Đã lưu cấu hình.",
      );
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tasks = data?.tasks ?? [];
  const settings = data?.settings;
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-7 p-5 lg:p-9">
      <nav
        className="flex flex-wrap items-center justify-between gap-3 md:hidden"
        aria-label="Workspace navigation"
      >
        <Link className="text-sm font-bold text-blue-700" href="/dashboard">
          AI Growth OS
        </Link>
        <select
          aria-label="Workspace"
          className="max-w-48 rounded-lg border border-slate-300 p-2 text-sm"
          value={workspace.id}
          onChange={(e) => selectWorkspace(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            Workspace / {workspace.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Agent Operations
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Theo dõi sáu agent, từ nghiên cứu đến kết quả. Tự cập nhật mỗi 5
            giây.
          </p>
        </div>
        <Link
          href="/review-queue"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
        >
          Hàng chờ phê duyệt →
        </Link>
      </header>
      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Đang tải trạng thái agent…" />}
      {data && (
        <>
          {tasks.some((t) => t.synthetic) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Có dữ liệu demo (synthetic) trong lịch sử. Các task demo không
              chứng minh agent đang thực thi thật.
            </p>
          )}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-900">Điều khiển tự động</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {settings?.enabled ? "Đã bật lịch" : "Lịch đang tắt"} · Tick
                  gần nhất: {date(settings?.last_tick_at)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Lịch tiếp theo: {date(settings?.next_run_at)}. Tạm dừng lịch
                  không hủy task đã được nhận.
                </p>
              </div>
              <span
                className={`self-start rounded-md px-3 py-1 text-xs font-semibold ${settings?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
              >
                {settings?.enabled ? "Lịch đã bật" : "Lịch đã tắt"}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <label className="text-sm font-medium">
                Chu kỳ (giờ)
                <input
                  aria-label="Chu kỳ giờ"
                  type="number"
                  min={1}
                  max={168}
                  value={interval}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="flex-1 text-sm font-medium">
                CTA của campaign
                <input
                  value={cta}
                  maxLength={200}
                  onChange={(e) => setCta(e.target.value)}
                  className="mt-1 block w-full min-w-48 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <button
                disabled={!canApprove || busy}
                onClick={() => save(!settings?.enabled)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {settings?.enabled ? "Tạm dừng lịch" : "Bật tự động"}
              </button>
              <button
                disabled={!canApprove || busy}
                onClick={() => save(Boolean(settings?.enabled), true)}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Chạy ngay
              </button>
            </div>
            {settings?.last_error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {settings.last_error}
              </p>
            )}
            <p role="status" className="mt-3 text-sm text-slate-600">
              {message ||
                "Chỉ chủ workspace có thể thay đổi lịch. Nội dung đối ngoại cần phê duyệt."}
            </p>
          </section>
          <section
            aria-label="Sáu agent"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {roles.map(([id, name, description]) => {
              const latest = tasks.find((t) => t.role === id);
              const running = tasks.filter(
                (t) => t.role === id && t.status === "running" && !t.synthetic,
              ).length;
              return (
                <button
                  key={id}
                  onClick={() => setRole(role === id ? "all" : id)}
                  className={`rounded-xl border bg-white p-5 text-left transition-colors hover:border-blue-400 ${role === id ? "border-blue-600" : "border-slate-200"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold text-slate-900">{name}</h2>
                    <span
                      className={`rounded-md px-2 py-1 text-xs ${badge(running ? "running" : latest?.status)}`}
                    >
                      {running
                        ? `${running} đang chạy`
                        : latest
                          ? `${latest.synthetic ? "Demo: " : ""}${labels[latest.status]}`
                          : "Chưa có task"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{description}</p>
                  <p className="mt-5 text-xs text-slate-500">
                    {tasks.filter((t) => t.role === id).length} task trong 100
                    task gần nhất
                  </p>
                </button>
              );
            })}
          </section>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex justify-between p-5">
              <h2 className="font-bold">Tiến trình thực thi</h2>
              <button
                onClick={() => setRole("all")}
                className="text-sm text-blue-700"
              >
                Tất cả agent
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      "Agent / nhiệm vụ",
                      "Trạng thái",
                      "Bắt đầu",
                      "Kết thúc",
                      "Lần nhận",
                    ].map((s) => (
                      <th className="px-5 py-3" key={s}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks
                    .filter((t) => role === "all" || t.role === role)
                    .map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="px-5 py-4">
                          <button
                            onClick={() => setSelected(t)}
                            className="font-semibold text-blue-800 hover:underline"
                          >
                            {t.operation}
                          </button>
                          <p className="mt-1 font-mono text-xs text-slate-400">
                            {t.id.slice(0, 8)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-md px-2 py-1 text-xs ${badge(t.status)}`}
                          >
                            {t.synthetic ? "Demo: " : ""}
                            {labels[t.status] ?? t.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {date(t.started_at)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {date(t.completed_at)}
                        </td>
                        <td className="px-5 py-4">{t.attempts ?? 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!tasks.length && (
              <p className="p-8 text-center text-slate-500">
                Chưa có task. Chuẩn bị nguồn đã duyệt và knowledge context, sau
                đó chọn Chạy ngay.
              </p>
            )}
            <p className="p-4 text-xs text-slate-400">
              Dữ liệu cập nhật: {date(data.observed_at)} · Thứ tự: Research →
              Growth Lead → SEO → phê duyệt → Content. Community chạy khi có câu
              hỏi; Performance cần snapshot metrics.
            </p>
          </section>
        </>
      )}
      {selected && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết task"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-5"
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6">
            <div className="flex justify-between gap-4">
              <h2 className="font-bold">{selected.operation}</h2>
              <button
                autoFocus
                onClick={() => setSelected(null)}
                className="text-blue-700"
              >
                Đóng
              </button>
            </div>
            <pre className="my-5 overflow-auto rounded-lg bg-slate-50 p-4 text-xs">
              {JSON.stringify(selected, null, 2)}
            </pre>
            {selected.result_ref && (
              <Link href="/artifacts" className="text-blue-700">
                Xem kết quả trong Artifacts →
              </Link>
            )}
            {selected.status === "failed" && canApprove && (
              <button
                className="ml-4 text-blue-700"
                onClick={async () => {
                  try {
                    await growthApi.retryTask(workspace.id, selected.id);
                    setSelected(null);
                    reload();
                  } catch (e) {
                    setMessage((e as Error).message);
                    setSelected(null);
                  }
                }}
              >
                Thử lại task
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
export default function AgentOperations() {
  return (
    <div className={styles.root}>
      <AppShell activeTab="agents" pageTitle="Agent Operations">
        <Operations />
      </AppShell>
    </div>
  );
}
