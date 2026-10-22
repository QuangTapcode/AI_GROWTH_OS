"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/features/shell/AppShell";
import { ErrorBlock, LoadingBlock } from "@/features/shell/StatusViews";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { apiRequest, growthApi } from "@/lib/api";
import type {
  Approval,
  BusinessProfile,
  ContentArtifact,
  IntegrationProviderStatus,
  SystemException,
  WorkflowTask,
} from "@/lib/apiTypes";
import { useApiData } from "@/lib/useApiData";

type RoleId = "research" | "growth_lead" | "seo" | "content" | "community" | "performance";

type SourceSummary = {
  id: string;
  title?: string | null;
  url?: string | null;
  status: string;
  version?: number;
  content_hash?: string | null;
};

type AutomationSnapshot = {
  settings?: {
    enabled: boolean;
    interval_hours: number;
    cta: string;
    auto_approve_outputs: boolean;
    auto_publish_facebook: boolean;
    next_run_at: string;
    last_tick_at: string | null;
    last_error: string | null;
  } | null;
  tasks: Array<WorkflowTask & { synthetic?: boolean; queue_status?: string; attempts?: number; error_code?: string }>;
  observed_at: string;
};

type AgentData = {
  automation: AutomationSnapshot;
  tasks: WorkflowTask[];
  artifacts: ContentArtifact[];
  approvals: Approval[];
  exceptions: SystemException[];
  integrations: IntegrationProviderStatus[];
  businessProfile: BusinessProfile | null;
  sources: SourceSummary[];
  warnings: string[];
};

type CheckState = "ready" | "missing" | "warning";
type Requirement = { label: string; detail: string; state: CheckState };

type AgentConfig = {
  name: string;
  subtitle: string;
  operations: string[];
  steps: string[];
  inputs: string[];
  outputs: string[];
  improvements: string[];
};

const AGENTS: Record<RoleId, AgentConfig> = {
  research: {
    name: "Research & Trend",
    subtitle: "Nghiên cứu và tìm cơ hội có căn cứ",
    operations: ["research.run"],
    steps: ["Đọc business profile và knowledge context", "Lọc source đã approved trong tenant", "Trích dẫn finding và bàn giao Growth Lead"],
    inputs: ["Business profile", "Knowledge context hiện tại", "Nguồn đã approved và còn hiệu lực", "Mục tiêu hoặc content inventory (nếu có)"],
    outputs: ["Research brief có finding", "Citation trỏ tới source/chunk", "Missing facts và trạng thái handoff"],
    improvements: ["Bổ sung nguồn trực tiếp từ tripc.vn và duyệt nguồn", "Đảm bảo mỗi finding có quote/chunk_id", "Bàn giao finding đã chọn cho Growth Lead"],
  },
  growth_lead: {
    name: "Growth Lead",
    subtitle: "Chọn cơ hội và lập kế hoạch campaign",
    operations: ["opportunity.score", "strategy.generate", "brief.generate", "learning.analyze"],
    steps: ["Nhận Research brief đã grounded", "Chấm điểm và chọn một opportunity", "Tạo campaign plan, task SEO/Content và chờ duyệt"],
    inputs: ["Business profile", "Knowledge context", "Research artifact hợp lệ", "CTA, deadline hoặc score factors"],
    outputs: ["Campaign plan", "Opportunity được chọn", "Task phụ thuộc cho SEO/Content", "Missing facts và approval gate"],
    improvements: ["Chạy Research trước khi lập kế hoạch", "Không dùng finding thiếu citation", "Duyệt plan trước khi task downstream được nhận"],
  },
  seo: {
    name: "SEO Worker",
    subtitle: "Tạo draft bài viết, title, meta và nguồn",
    operations: ["seo.audit", "seo.local_draft", "content.refresh"],
    steps: ["Đọc Research/Growth Lead artifact", "Tạo title, meta, heading và bài draft", "Kiểm tra citation rồi gửi approval; không tự publish"],
    inputs: ["Business profile", "Knowledge context", "Research finding hoặc parent artifact", "CTA"],
    outputs: ["SEO article draft", "Title/meta/headings", "Citations và SEO checks", "Version/hash để Content nhận đúng bản"],
    improvements: ["Giữ parent artifact cùng tenant và context", "Bổ sung citation cho mọi claim", "Approval cũ phải bị vô hiệu khi source/context đổi"],
  },
  content: {
    name: "Content Marketing",
    subtitle: "Chuyển bài đã duyệt thành social pack",
    operations: ["content.generate", "content.repurpose", "content.quality_check"],
    steps: ["Nhận SEO article đã approved", "Tạo caption, CTA, alt text và asset reference", "Chờ approval rồi tạo job Facebook"],
    inputs: ["Business profile", "Knowledge context", "SEO/source article", "CTA và asset được phép dùng"],
    outputs: ["Social pack theo channel", "Caption/CTA/alt text", "Citation và asset license", "Artifact version/hash"],
    improvements: ["Kết nối Facebook Page ở chế độ live", "Cấp approved image asset có attribution", "Chỉ schedule artifact đã approved"],
  },
  community: {
    name: "Community",
    subtitle: "Phản hồi câu hỏi và đề xuất lead",
    operations: ["community.response"],
    steps: ["Nhận câu hỏi từ kênh đã kết nối", "Tìm quote approved phù hợp", "Tạo draft reply, escalation hoặc lead proposal"],
    inputs: ["Business profile", "Knowledge context", "Câu hỏi/comment", "Publication/lead context nếu có"],
    outputs: ["Reply draft có citation", "Escalation reason khi thiếu dữ kiện", "Lead proposal không chứa raw contact ngoài phạm vi"],
    improvements: ["Kết nối Facebook Page để nhận comment thật", "Duyệt nguồn trước khi trả lời", "Escalate câu hỏi thiếu facts thay vì đoán"],
  },
  performance: {
    name: "Performance",
    subtitle: "Đo lường, báo cáo và đề xuất thử nghiệm",
    operations: ["analytics.report", "experiment.hypothesis"],
    steps: ["Đọc metric snapshot theo tenant và time window", "Phân biệt missing với zero", "Tạo report/experiment proposal, không sửa ngân sách"],
    inputs: ["Business profile", "Knowledge context", "GA4/GSC/Meta Ads metrics", "Khoảng thời gian hợp lệ"],
    outputs: ["Performance report", "Metric snapshot và availability", "Observation có giới hạn nhân quả", "Experiment proposal"],
    improvements: ["Kết nối GA4 và xác minh Search Console property", "Chọn time window có dữ liệu", "Giữ proposal ở dạng approval, không mutation spend"],
  },
};

const ROLE_IDS = Object.keys(AGENTS) as RoleId[];

const statusLabels: Record<string, string> = {
  queued: "Trong hàng đợi",
  pending: "Chờ phụ thuộc",
  running: "Đang chạy",
  awaiting_approval: "Chờ duyệt",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "Chưa có";
}

function statusClass(status?: string) {
  if (status === "running") return "bg-blue-100 text-blue-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "awaiting_approval") return "bg-amber-100 text-amber-900";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function valueText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function payloadArray(payload: Record<string, unknown>, key: string) {
  return Array.isArray(payload[key]) ? payload[key] : [];
}

function provider(integrations: IntegrationProviderStatus[], names: string[]) {
  return integrations.find((item) => names.includes(item.provider.toLowerCase()));
}

async function loadAgentData(workspaceId: string, signal: AbortSignal): Promise<AgentData> {
  const requests = await Promise.allSettled([
    apiRequest<AutomationSnapshot>(`/workspaces/${workspaceId}/automation`, { signal }),
    growthApi.listTasks(workspaceId, signal),
    growthApi.listArtifacts(workspaceId, signal),
    growthApi.listApprovals(workspaceId, signal),
    growthApi.listExceptions(workspaceId, signal),
    growthApi.getIntegrations(workspaceId, signal),
    growthApi.getBusinessProfile(workspaceId, signal),
    apiRequest<{ items: SourceSummary[] }>(`/workspaces/${workspaceId}/sources?status=approved`, { signal }),
  ]);

  const read = <T,>(index: number, fallback: T): T => {
    const result = requests[index];
    return result?.status === "fulfilled" ? result.value as T : fallback;
  };
  const warnings = requests
    .map((result, index) => result.status === "rejected" ? `Không tải được nguồn dữ liệu #${index + 1}` : null)
    .filter((value): value is string => Boolean(value));
  const automation = read<AutomationSnapshot | null>(0, null);
  if (!automation) throw requests[0].status === "rejected" ? requests[0].reason : new Error("Automation data is unavailable");
  return {
    automation,
    tasks: read<{ items: WorkflowTask[] }>(1, { items: [] }).items,
    artifacts: read<{ items: ContentArtifact[] }>(2, { items: [] }).items,
    approvals: read<{ items: Approval[] }>(3, { items: [] }).items,
    exceptions: read<{ items: SystemException[] }>(4, { items: [] }).items,
    integrations: read<{ providers: IntegrationProviderStatus[] }>(5, { providers: [] }).providers,
    businessProfile: read<BusinessProfile | null>(6, null),
    sources: read<{ items: SourceSummary[] }>(7, { items: [] }).items,
    warnings,
  };
}

function Check({ state, label, detail }: Requirement) {
  const tone = state === "ready" ? "border-emerald-200 bg-emerald-50" : state === "warning" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  const icon = state === "ready" ? "✓" : state === "warning" ? "!" : "×";
  const iconTone = state === "ready" ? "bg-emerald-600" : state === "warning" ? "bg-amber-500" : "bg-red-600";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex gap-3">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${iconTone}`}>{icon}</span>
        <div><p className="text-sm font-semibold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>
      </div>
    </div>
  );
}

function AgentPage({ role }: { role: RoleId }) {
  const { workspace, canApprove } = useWorkspace();
  const config = AGENTS[role];
  const { data, error, loading, reload } = useApiData(`${workspace.id}:${role}`, (signal) => loadAgentData(workspace.id, signal));
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const roleTasks = useMemo(() => data?.tasks.filter((task) => task.role === role).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [], [data, role]);
  const roleArtifacts = useMemo(() => data?.artifacts.filter((artifact) => artifact.role === role).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [], [data, role]);
  const latestTask = roleTasks[0];
  const latestArtifact = roleArtifacts[0];
  const failedTasks = roleTasks.filter((task) => task.status === "failed");
  const pendingApprovals = data?.approvals.filter((approval) => approval.status === "pending" && (!latestArtifact || approval.target_id === latestArtifact.id)) ?? [];
  const roleExceptions = data?.exceptions.filter((item) => !item.source_task_id || roleTasks.some((task) => task.id === item.source_task_id)) ?? [];
  const contextId = latestTask?.context_snapshot_id ?? latestArtifact?.context_snapshot_id ?? null;
  const approvedSources = data?.sources.length ?? 0;
  const facebook = provider(data?.integrations ?? [], ["facebook", "meta", "facebook_page"]);
  const tiktok = provider(data?.integrations ?? [], ["tiktok"]);
  const ga4 = provider(data?.integrations ?? [], ["ga4", "google_analytics"]);
  const gsc = provider(data?.integrations ?? [], ["gsc", "search_console"]);
  const metaAds = provider(data?.integrations ?? [], ["meta_ads", "facebook_ads"]);
  const parentArtifact = data?.artifacts.find((artifact) => artifact.role === (role === "seo" || role === "growth_lead" ? "research" : "seo"));
  const artifactCitations = latestArtifact ? latestArtifact.evidence.length + payloadArray(latestArtifact.payload, "citations").length : 0;
  const approvedAsset = latestArtifact && payloadArray(latestArtifact.payload, "image_assets").some((asset) => typeof asset === "object" && asset !== null && (asset as Record<string, unknown>).status === "approved");

  const requirements: Requirement[] = data ? [
    { label: "API và worker quan sát được", detail: `Đã đọc automation lúc ${formatDate(data.automation.observed_at)}.`, state: "ready" },
    { label: "Business profile", detail: data.businessProfile ? `${data.businessProfile.company_name}, version ${data.businessProfile.version}.` : "Chưa có business profile cho workspace.", state: data.businessProfile ? "ready" : "missing" },
    { label: "Knowledge context và source approved", detail: contextId ? `${approvedSources} source approved; context ${contextId.slice(0, 12)}…` : `${approvedSources} source approved nhưng task/artifact chưa có context_snapshot_id.`, state: contextId && approvedSources > 0 ? "ready" : "missing" },
    ...(role === "research" ? [] : [{ label: "Parent artifact hợp lệ", detail: parentArtifact ? `${parentArtifact.role}/${parentArtifact.operation}, version ${parentArtifact.version}.` : "Chưa có artifact upstream cùng workspace để bàn giao.", state: parentArtifact ? "ready" as CheckState : "missing" as CheckState }]),
    ...((role === "content" || role === "community") ? [{ label: "Facebook Page", detail: facebook?.status === "connected" ? "Đã kết nối và có thể kiểm tra quyền publish." : facebook?.missing_reason ?? "Facebook Page chưa connected.", state: facebook?.status === "connected" ? "ready" as CheckState : "missing" as CheckState } ] : []),
    ...(role === "content" ? [{ label: "Approved image asset", detail: approvedAsset ? "Artifact mới nhất có asset đã approved." : "Social pack chưa có approved image asset.", state: approvedAsset ? "ready" as CheckState : "warning" as CheckState } ] : []),
    ...(role === "performance" ? [{ label: "Metric providers", detail: `GA4: ${ga4?.status ?? "chưa kết nối"}; GSC: ${gsc?.status ?? "chưa kết nối"}; Meta Ads: ${metaAds?.status ?? "chưa kết nối"}.`, state: ga4?.status === "connected" || gsc?.status === "connected" || metaAds?.status === "connected" ? "warning" as CheckState : "missing" as CheckState } ] : []),
    ...(role === "content" || role === "community" ? [{ label: "TikTok (tuỳ chọn)", detail: tiktok?.status === "connected" ? "Đã kết nối." : "Chưa kết nối; không chặn luồng Facebook.", state: tiktok?.status === "connected" ? "ready" as CheckState : "warning" as CheckState } ] : []),
  ] : [];

  async function retry(task: WorkflowTask) {
    setRetrying(task.id); setNotice("");
    try { await growthApi.retryTask(workspace.id, task.id); setNotice("Đã đưa task lỗi trở lại hàng đợi."); reload(); }
    catch (err) { setNotice((err as Error).message); }
    finally { setRetrying(null); }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-5 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500"><Link href="/agents" className="font-semibold text-blue-700 hover:underline">Agent Operations</Link><span>/</span><span>{config.name}</span></div>
        <div className="flex gap-2"><Link href="/review-queue" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Review Queue</Link><button onClick={reload} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Làm mới</button></div>
      </div>
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Agent detail / {workspace.name}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{config.name}</h1><p className="mt-2 text-sm text-slate-600">{config.subtitle}. Trang này cho thấy agent cần gì, đang làm gì, đầu ra nào đã tạo và bước tiếp theo.</p></div><div className="flex items-center gap-2">{latestTask ? <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusClass(latestTask.status)}`}>{statusLabels[latestTask.status] ?? latestTask.status}</span> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Chưa có task</span>}</div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Task role này" value={String(roleTasks.length)} /><Metric label="Đã hoàn tất" value={String(roleTasks.filter((t) => t.status === "completed").length)} tone="green" /><Metric label="Đang/chờ chạy" value={String(roleTasks.filter((t) => ["queued", "pending", "running"].includes(t.status)).length)} tone="blue" /><Metric label="Lỗi" value={String(failedTasks.length)} tone={failedTasks.length ? "red" : undefined} /><Metric label="Artifact" value={String(roleArtifacts.length)} /></div>
      </header>
      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Đang tải dữ liệu vận hành của agent…" />}
      {data && <>
        {data.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Một số nguồn phụ chưa tải được: {data.warnings.join(", ")}. Các phần còn lại vẫn hiển thị theo dữ liệu thực có.</div>}
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Cách agent hoạt động" subtitle="Chu trình thực tế của role này trong pipeline." /><div className="mt-5 space-y-3">{config.steps.map((step, index) => <div key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span><p className="pt-1 text-sm text-slate-700">{step}</p></div>)}</div><div className="mt-6 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operations được phép</p><div className="mt-2 flex flex-wrap gap-2">{config.operations.map((operation) => <code key={operation} className="rounded-md bg-white px-2 py-1 text-xs text-blue-800 shadow-sm ring-1 ring-slate-200">{operation}</code>)}</div></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Đầu vào và điều kiện" subtitle="Màu xanh là đủ, vàng cần theo dõi, đỏ đang chặn chạy." /><div className="mt-5 space-y-3">{requirements.map((item) => <Check key={item.label} {...item} />)}</div></section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Input / output contract" subtitle="Danh sách kiểm tra theo contract của agent." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Contract title="Input cần có" items={config.inputs} /><Contract title="Output đạt chuẩn" items={config.outputs} /></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Cần cải thiện" subtitle="Ưu tiên được suy ra từ trạng thái thật của workspace." /><ul className="mt-5 space-y-3">{[...(!contextId || !approvedSources ? ["Tạo current knowledge context từ source approved trước khi chạy."] : []), ...(failedTasks.length ? [`Xử lý ${failedTasks.length} task lỗi và xem error_details trước khi retry.`] : []), ...(pendingApprovals.length ? [`Có ${pendingApprovals.length} approval pending; cần owner review trước handoff.`] : []), ...config.improvements].slice(0, 6).map((item) => <li key={item} className="flex gap-3 text-sm text-slate-700"><span className="mt-1 text-blue-600">→</span><span>{item}</span></li>)}</ul></section>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Đầu ra gần nhất" subtitle="Artifact mới nhất, version/hash và bằng chứng để kiểm tra chất lượng." />{latestArtifact ? <div className="mt-5 rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{latestArtifact.title || latestArtifact.artifact_type}</h3><p className="mt-1 text-xs text-slate-500">{latestArtifact.operation} · tạo {formatDate(latestArtifact.created_at)}</p></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">v{latestArtifact.version}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Info label="Artifact ID" value={latestArtifact.id.slice(0, 16)} /><Info label="Context" value={latestArtifact.context_snapshot_id?.slice(0, 16) ?? "Thiếu"} /><Info label="Citation/evidence" value={String(artifactCitations)} /></div><p className="mt-4 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">SHA-256: {latestArtifact.content_hash}</p><Link href="/artifacts" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">Mở toàn bộ artifact ledger →</Link></div> : <Empty title="Agent chưa tạo artifact" description="Hãy chạy upstream task và kiểm tra các điều kiện màu đỏ ở trên." />}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><SectionTitle title="Task và lỗi gần đây" subtitle="Đây là log vận hành thực tế của role, không phải trạng thái demo." />{notice && <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</span>}</div>{roleTasks.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Operation</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Queue</th><th className="px-4 py-3">Bắt đầu</th><th className="px-4 py-3">Lỗi</th><th className="px-4 py-3" /></tr></thead><tbody>{roleTasks.slice(0, 20).map((task) => <tr key={task.id} className="border-t border-slate-100 align-top"><td className="px-4 py-4"><p className="font-semibold text-slate-900">{task.operation}</p><p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}</p></td><td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(task.status)}`}>{statusLabels[task.status] ?? task.status}</span></td><td className="px-4 py-4 text-xs text-slate-500">{valueText((task as WorkflowTask & { queue_status?: string }).queue_status) || "—"}<br />attempt {String((task as WorkflowTask & { attempts?: number }).attempts ?? task.retry_count)}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDate(task.started_at ?? task.created_at)}</td><td className="max-w-xs px-4 py-4 text-xs text-red-700">{task.error_details ? <pre className="whitespace-pre-wrap">{JSON.stringify(task.error_details)}</pre> : "—"}</td><td className="px-4 py-4">{task.status === "failed" && canApprove && <button disabled={retrying === task.id} onClick={() => retry(task)} className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50">{retrying === task.id ? "Đang retry…" : "Retry"}</button>}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có task cho agent này" description="Agent chỉ xuất hiện ở đây khi worker nhận đúng operation trong workspace." />}</section>
        <section className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Approval và handoff" subtitle="Output chỉ được chuyển bước khi version/hash còn hợp lệ." /><div className="mt-4 space-y-3"><Info label="Approval pending" value={String(pendingApprovals.length)} /><Info label="Approval gần nhất" value={data.approvals.find((item) => latestArtifact && item.target_id === latestArtifact.id)?.status ?? "Chưa có"} /><Info label="Context snapshot" value={contextId ?? "Thiếu"} /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Exception cần xử lý" subtitle="Các exception liên quan task của role hoặc exception workspace chưa gán task." />{roleExceptions.length ? <div className="mt-4 space-y-3">{roleExceptions.slice(0, 5).map((item) => <div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-4"><div className="flex justify-between gap-3"><p className="font-semibold text-red-900">{item.code} · {item.title}</p><span className="text-xs text-red-700">{item.severity}</span></div><p className="mt-1 text-xs text-red-800">{item.description || "Không có mô tả."}</p></div>)}</div> : <Empty title="Không có exception mở" description="API chưa báo lỗi hệ thống gắn với role này." />}</section></section>
      </>}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "blue" | "red" }) { const color = tone === "green" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : tone === "red" ? "text-red-700" : "text-slate-900"; return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></div>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Contract({ title, items }: { title: string; items: string[] }) { return <div><h3 className="text-sm font-bold text-slate-800">{title}</h3><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm text-slate-600"><span className="text-blue-600">•</span><span>{item}</span></li>)}</ul></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="max-w-[65%] truncate font-semibold text-slate-800">{value}</span></div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>; }

export default function AgentDetailView({ role }: { role: string }) {
  const normalized = ROLE_IDS.includes(role as RoleId) ? role as RoleId : "research";
  return <AppShell activeTab="agents" pageTitle={AGENTS[normalized].name}><AgentPage role={normalized} /></AppShell>;
}
