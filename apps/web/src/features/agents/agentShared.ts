/** Helpers shared by the agent detail pages. */

export type LearningReport = {
  status: "draft" | "insufficient_data";
  iteration: number;
  max_iterations: number;
  learning: string[];
  next_tasks: { iteration: number; reason: string }[];
  missing_facts: string[];
  stopped_reason: string | null;
};

export const MAX_LEARNING_ITERATIONS = 3;

export const learningStopLabels: Record<string, string> = {
  insufficient_data: "Thiếu báo cáo Performance hoàn chỉnh hoặc lead aggregate",
  max_iterations: `Đã đạt giới hạn ${MAX_LEARNING_ITERATIONS} vòng học`,
  task_quota: "Quota task bằng 0",
  duplicate_proposal: "Đề xuất trùng với vòng đã mở",
  no_measured_signal: "Chưa đo được lượt xem, click hay lead nào nên chưa có gì để học. Vòng theo lịch vẫn chạy.",
};

export type CheckState = "ready" | "missing" | "warning";
export type Requirement = { label: string; detail: string; state: CheckState; action?: { href: string; label: string } };

export const statusLabels: Record<string, string> = {
  queued: "Trong hàng đợi",
  pending: "Chờ phụ thuộc",
  running: "Đang chạy",
  awaiting_approval: "Chờ duyệt",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "Chưa có";
}

export function statusClass(status?: string) {
  if (status === "running") return "bg-blue-100 text-blue-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "awaiting_approval") return "bg-amber-100 text-amber-900";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

export function valueText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
