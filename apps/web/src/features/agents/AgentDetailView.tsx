"use client";

import { useEffect, useMemo, useState } from "react";
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
import ArtifactReviewContent from "@/features/review-queue/components/ArtifactReviewContent";
import ResearchDiscoveryPanel from "./ResearchDiscoveryPanel";

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
  currentContext: { snapshot_id: string; approved_sources: { source_id: string; version: number }[] } | null;
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

type PerformanceReport = {
  status: "draft" | "insufficient_data";
  metrics: Record<string, number | null>;
  window: { start: string; end: string } | null;
  metric_snapshot_id: string | null;
  observations: string[];
  proposal: string | null;
  attribution: string;
  missing_facts: string[];
  spend_mutation_allowed: boolean;
  experiment?: {
    hypothesis: string;
    control_variant: string;
    treatment_variant: string;
    primary_metric: string;
    period: { start: string; end: string };
    grouping: string;
  } | null;
};

type LearningReport = {
  status: "draft" | "insufficient_data";
  iteration: number;
  max_iterations: number;
  learning: string[];
  next_tasks: { iteration: number; reason: string }[];
  missing_facts: string[];
  stopped_reason: string | null;
};

const MAX_LEARNING_ITERATIONS = 3;

const learningStopLabels: Record<string, string> = {
  insufficient_data: "Thiếu báo cáo Performance hoàn chỉnh hoặc lead aggregate",
  max_iterations: `Đã đạt giới hạn ${MAX_LEARNING_ITERATIONS} vòng học`,
  task_quota: "Quota task bằng 0",
  duplicate_proposal: "Đề xuất trùng với vòng đã mở",
};

type CheckState = "ready" | "missing" | "warning";
type Requirement = { label: string; detail: string; state: CheckState; action?: { href: string; label: string } };

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
    apiRequest<{ context: AgentData["currentContext"] }>(`/workspaces/${workspaceId}/knowledge-contexts`, { signal }),
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
    currentContext: read<{ context: AgentData["currentContext"] }>(8, { context: null }).context,
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

function Check({ state, label, detail, action }: Requirement) {
  const tone = state === "ready" ? "border-emerald-200 bg-emerald-50" : state === "warning" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  const icon = state === "ready" ? "✓" : state === "warning" ? "!" : "×";
  const iconTone = state === "ready" ? "bg-emerald-600" : state === "warning" ? "bg-amber-500" : "bg-red-600";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex gap-3">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${iconTone}`}>{icon}</span>
        <div><p className="text-sm font-semibold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-600">{detail}</p>{action && <Link href={action.href} className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline">{action.label} →</Link>}</div>
      </div>
    </div>
  );
}

function AgentPage({ role }: { role: RoleId }) {
  const { workspace, canApprove, canEdit } = useWorkspace();
  const config = AGENTS[role];
  const { data, error, loading, reload } = useApiData(`${workspace.id}:${role}`, (signal) => loadAgentData(workspace.id, signal));
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The task the user just started; "waiting" is derived from its live status below.
  const [requestedTaskId, setRequestedTaskId] = useState<string | null>(null);
  const [selectedReplyId, setSelectedReplyId] = useState("");
  // Reset per-workspace UI state while rendering (React "adjust state on prop change"), not in an effect.
  const [stateWorkspace, setStateWorkspace] = useState(workspace.id);
  const [loopNotice, setLoopNotice] = useState("");
  if (stateWorkspace !== workspace.id) {
    setStateWorkspace(workspace.id);
    setRequestedTaskId(null);
    setSelectedReplyId("");
    setNotice("");
    setLoopNotice("");
  }
  const [researchId, setResearchId] = useState("");
  const [planId, setPlanId] = useState("");
  const [cta, setCta] = useState("Liên hệ TripC để được tư vấn nơi ở phù hợp tại Đà Nẵng");
  const [deadline, setDeadline] = useState(() => { const date = new Date(Date.now() + 7 * 86400000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });

  const roleTasks = useMemo(() => data?.tasks.filter((task) => task.role === role).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [], [data, role]);
  const roleArtifacts = useMemo(() => data?.artifacts.filter((artifact) => artifact.role === role).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [], [data, role]);
  const latestTask = roleTasks[0];
  const latestArtifact = roleArtifacts[0];
  const facebookPost = valueText((latestArtifact?.payload.result as { facebook?: { text?: unknown } | null } | undefined)?.facebook?.text);
  const availableResearch = data?.artifacts.filter((item) => item.operation === "research.run" && item.context_snapshot_id === data.currentContext?.snapshot_id && (item.payload.result as Record<string, unknown> | undefined)?.status === "ready_for_handoff").sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const chosenResearch = availableResearch.find((item) => item.id === researchId) ?? availableResearch[0];
  const approvedPlans = data?.artifacts.filter((item) => item.operation === "strategy.generate" && item.context_snapshot_id === data.currentContext?.snapshot_id && data.approvals.some((approval) => approval.target_id === item.id && approval.status === "approved" && approval.target_version === item.version && approval.target_hash === item.content_hash)).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const chosenPlan = approvedPlans.find((item) => item.id === planId) ?? approvedPlans[0];
  // Closed loop: Performance draft + lead aggregate → Learning → owner opens the next Research round.
  const inContext = (operation: string) => data?.artifacts.filter((item) => item.operation === operation && item.context_snapshot_id === data.currentContext?.snapshot_id).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const performanceDraft = inContext("analytics.report").find((item) => (item.payload.result as Partial<PerformanceReport> | undefined)?.status === "draft");
  const leadAggregate = inContext("lead.aggregate")[0];
  const latestLearning = inContext("learning.analyze")[0];
  const learningReport = latestLearning?.payload.result as Partial<LearningReport> | undefined;
  const learningRounds = data?.tasks.filter((task) => task.operation === "research.run" && task.payload?.learning_artifact) ?? [];
  // A learning artifact proposes round i+1; the next learning run continues from the highest round opened.
  const loopIteration = Math.max(0, ...learningRounds.map((task) => Number(task.payload.iteration) || 0));
  const openedRound = latestLearning && learningRounds.find((task) => (task.payload.learning_artifact as { artifact_id?: string } | undefined)?.artifact_id === latestLearning.id);
  const canOpenRound = !!latestLearning && learningReport?.status === "draft" && !!learningReport.next_tasks?.length && !learningReport.missing_facts?.length && !openedRound;
  const requestedTask = requestedTaskId ? data?.tasks.find((item) => item.id === requestedTaskId) : undefined;
  const requestedDone = !!requestedTask && ["awaiting_approval", "completed", "failed", "cancelled"].includes(requestedTask.status);
  // Content tasks opened by an approved SEO draft run without a click on this page; follow them too.
  const activeContentTask = role === "content"
    ? roleTasks.find((task) => task.operation === "content.repurpose" && task.campaign_id && ["queued", "running"].includes(task.status))
    : undefined;
  const waitingTaskId = (requestedTaskId && !requestedDone ? requestedTaskId : null) ?? activeContentTask?.id ?? null;
  const waitingTask = data?.tasks.find(task => task.id === waitingTaskId);
  const waitingMessage = waitingTask?.status === 'running'
    ? 'Worker đã nhận task và đang xử lý. Trang tự cập nhật kết quả.'
    : 'Task đang chờ worker nhận, chưa bắt đầu xử lý. Không cần bấm chạy thêm.';
  const replyId = selectedReplyId || (requestedDone ? requestedTask?.result_ref ?? "" : "");
  const communityArtifact = roleArtifacts.find((item) => item.id === replyId) ?? latestArtifact;
  const communityResult = communityArtifact?.payload.result as Record<string, unknown> | undefined;
  const communityEvidence = communityArtifact?.evidence.length ? communityArtifact.evidence : (Array.isArray(communityResult?.citations) ? communityResult.citations as Record<string, unknown>[] : []);
  useEffect(() => {
    // Poll while a task is still running; completion is derived from the refreshed data.
    if (!waitingTaskId) return;
    const timer = window.setTimeout(reload, 2000);
    return () => window.clearTimeout(timer);
  }, [waitingTaskId, data, reload]);
  const performanceReport = role === "performance" && ["analytics.report", "experiment.hypothesis"].includes(latestArtifact?.operation ?? "")
    ? (latestArtifact.payload.result as Partial<PerformanceReport> | undefined)
    : null;
  const failedTasks = roleTasks.filter((task) => task.status === "failed");
  const pendingApprovals = data?.approvals.filter((approval) => approval.status === "pending" && (!latestArtifact || approval.target_id === latestArtifact.id)) ?? [];
  const roleExceptions = data?.exceptions.filter((item) => !item.source_task_id || roleTasks.some((task) => task.id === item.source_task_id)) ?? [];
  const contextId = data?.currentContext?.snapshot_id ?? null;
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
    { label: "API kết nối", detail: `Đọc dữ liệu lúc ${formatDate(data.automation.observed_at)}. Kết nối API không xác nhận worker đang chạy.`, state: "ready" },
    { label: "Business profile", detail: data.businessProfile ? `${data.businessProfile.company_name}, version ${data.businessProfile.version}.` : "Chưa có business profile cho workspace.", state: data.businessProfile ? "ready" : "missing" },
    { label: "Knowledge context và source approved", detail: contextId ? `${approvedSources} source approved; context ${contextId.slice(0, 12)}…` : `${approvedSources} source approved nhưng task/artifact chưa có context_snapshot_id.`, state: contextId && approvedSources > 0 ? "ready" : "missing" },
    ...(["research", "performance", "community"].includes(role) ? [] : [{ label: "Parent artifact hợp lệ", detail: parentArtifact ? `${parentArtifact.role}/${parentArtifact.operation}, version ${parentArtifact.version}.` : "Chưa có artifact upstream cùng workspace để bàn giao.", state: parentArtifact ? "ready" as CheckState : "missing" as CheckState }]),
    ...((role === "content" || role === "community") ? [{ label: "Facebook Page", detail: facebook?.status === "connected" ? "Đã kết nối. Quyền và nội dung được kiểm tra lại trước khi đăng." : role === "content" ? "Chưa kết nối hoặc chưa cấp quyền Facebook Page. Vẫn có thể tạo bản nháp; cần kết nối và cấp quyền trước khi đăng Facebook." : "Chưa kết nối hoặc chưa cấp quyền Facebook Page. Chưa thể nhận comment tự động; vẫn có thể soạn phản hồi từ câu hỏi nhập thủ công.", state: facebook?.status === "connected" ? "ready" as CheckState : "warning" as CheckState, ...(facebook?.status !== "connected" ? { action: { href: "/workspace-integrations", label: "Cấu hình kết nối Facebook" } } : {}) } ] : []),
    ...(role === "content" ? [{ label: "Approved image asset", detail: approvedAsset ? "Artifact mới nhất có asset đã approved." : "Chưa có ảnh được duyệt trong social pack. Vẫn có thể soạn nội dung; cần bổ sung và duyệt ảnh trước khi đăng bài có ảnh.", state: approvedAsset ? "ready" as CheckState : "warning" as CheckState, ...(!approvedAsset ? { action: { href: "/artifacts", label: "Kiểm tra nội dung và ảnh" } } : {}) } ] : []),
    ...(role === "performance" ? [{ label: "Metric providers", detail: `GA4: ${ga4?.status ?? "chưa kết nối"}; GSC: ${gsc?.status ?? "chưa kết nối"}; Meta Ads: ${metaAds?.status ?? "chưa kết nối"}. ${ga4?.status === "connected" || gsc?.status === "connected" || metaAds?.status === "connected" ? "Kết nối không đảm bảo time window đã có dữ liệu." : "Chưa kết nối provider; báo cáo vẫn có thể trả insufficient_data."}`, state: "warning" as CheckState } ] : []),
    ...(role === "content" || role === "community" ? [{ label: "TikTok (tuỳ chọn)", detail: tiktok?.status === "connected" ? "Đã kết nối." : "Chưa kết nối; không chặn luồng Facebook.", state: tiktok?.status === "connected" ? "ready" as CheckState : "warning" as CheckState } ] : []),
  ] : [];

  async function retry(task: WorkflowTask) {
    setRetrying(task.id); setNotice("");
    try { await growthApi.retryTask(workspace.id, task.id); setNotice("Đã đưa task lỗi trở lại hàng đợi."); reload(); }
    catch (err) { setNotice((err as Error).message); }
    finally { setRetrying(null); }
  }

  async function submitCommunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || submitting || !canEdit || !contextId) return;
    setSubmitting(true); setNotice("");
    try {
      const accepted = await apiRequest<{ task_id: string }>(`/workspaces/${workspace.id}/ai-tasks`, { method: "POST", body: {
        context_snapshot_id: contextId,
        input: { operation: "community.response", question: question.trim() },
      } });
      setRequestedTaskId(accepted.task_id); setSelectedReplyId("");
      setQuestion(""); setNotice("Đã đưa câu hỏi vào hàng đợi. Phản hồi sẽ tự cập nhật khi xử lý xong; nội dung cần duyệt trước khi gửi."); reload();
    } catch (err) { setNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function runResearch() {
    if (!contextId || submitting) return;
    setSubmitting(true); setNotice("");
    try {
      const task = await apiRequest<{ task_id: string }>(`/workspaces/${workspace.id}/ai-tasks`, { method: "POST", body: { context_snapshot_id: contextId, input: { operation: "research.run" } } });
      setRequestedTaskId(task.task_id); setNotice("Đã xếp Research vào hàng đợi. Kết quả sẽ tự cập nhật sau khi worker xử lý."); reload();
    } catch (err) { setNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function handoffResearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosenResearch || submitting) return;
    setSubmitting(true); setNotice("");
    try {
      const task = await apiRequest<{ task_id: string; deduplicated: boolean }>(`/workspaces/${workspace.id}/research-handoff`, { method: "POST", body: { research_artifact_id: chosenResearch.id, cta: cta.trim(), deadline: new Date(deadline).toISOString() } });
      setRequestedTaskId(task.task_id); setNotice(task.deduplicated ? "Bàn giao này đã có task Growth Lead; không tạo trùng." : "Đã bàn giao Research cho Growth Lead. Kế hoạch sẽ tự cập nhật và xuất hiện trong Review Queue."); reload();
    } catch (err) { setNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function startSeo() {
    if (!chosenPlan || submitting) return;
    setSubmitting(true); setNotice("");
    try {
      const accepted = await apiRequest<{ deduplicated: boolean; tasks: { task_id: string; role: string }[] }>(`/workspaces/${workspace.id}/seo-handoff`, { method: "POST", body: { plan_artifact_id: chosenPlan.id } });
      const seoTask = accepted.tasks.find((task) => task.role === "seo");
      if (seoTask) setRequestedTaskId(seoTask.task_id);
      setNotice(accepted.deduplicated ? "Kế hoạch đã được bàn giao; không tạo task SEO trùng." : "Đã tạo task SEO từ kế hoạch đã duyệt. Bài SEO sẽ tự cập nhật và được đưa vào Review Queue. Content chờ bài SEO được duyệt."); reload();
    } catch (err) { setNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function runPerformanceForLearning() {
    if (!contextId || submitting) return;
    setSubmitting(true); setLoopNotice("");
    try {
      const measured = await apiRequest<{ metrics_artifact_id: string; baseline_metrics_artifact_id: string | null }>(`/workspaces/${workspace.id}/measurement`, { method: "POST" });
      const task = await apiRequest<{ task_id: string }>(`/workspaces/${workspace.id}/ai-tasks`, { method: "POST", body: { context_snapshot_id: contextId, input: {
        operation: "analytics.report", metrics_artifact_id: measured.metrics_artifact_id,
        ...(measured.baseline_metrics_artifact_id ? { baseline_metrics_artifact_id: measured.baseline_metrics_artifact_id } : {}),
      } } });
      setRequestedTaskId(task.task_id); setLoopNotice("Đã chụp số liệu first-party và xếp Performance vào hàng đợi. Báo cáo sẽ tự cập nhật."); reload();
    } catch (err) { setLoopNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function runLearning() {
    if (!contextId || !performanceDraft || !leadAggregate || submitting) return;
    setSubmitting(true); setLoopNotice("");
    try {
      const task = await apiRequest<{ task_id: string }>(`/workspaces/${workspace.id}/ai-tasks`, { method: "POST", body: { context_snapshot_id: contextId, input: {
        operation: "learning.analyze", performance_artifact_id: performanceDraft.id, lead_summary_artifact_id: leadAggregate.id,
        iteration: loopIteration, max_iterations: MAX_LEARNING_ITERATIONS, task_quota: 1,
      } } });
      setRequestedTaskId(task.task_id); setLoopNotice("Đã xếp Learning vào hàng đợi. Kết quả sẽ tự cập nhật; mở vòng mới cần owner duyệt."); reload();
    } catch (err) { setLoopNotice((err as Error).message); }
    finally { setSubmitting(false); }
  }

  async function openNextRound() {
    if (!latestLearning || !canOpenRound || submitting) return;
    setSubmitting(true); setLoopNotice("");
    try {
      const accepted = await apiRequest<{ task_ids: string[] }>(`/workspaces/${workspace.id}/learning-tasks`, { method: "POST", body: latestLearning.payload.artifact });
      setRequestedTaskId(accepted.task_ids[0] ?? null);
      setLoopNotice(accepted.task_ids.length ? "Đã duyệt learning và mở vòng Research mới. Kết quả Research vẫn cần duyệt trước khi bàn giao." : "Learning không đề xuất task tiếp theo."); reload();
    } catch (err) { setLoopNotice((err as Error).message); }
    finally { setSubmitting(false); }
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
      {role === "content" && data && <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <SectionTitle title="SEO đã duyệt → Caption Marketing" subtitle="Content tự nhận bài SEO đã duyệt theo kế hoạch Growth Lead. Caption gồm mở đầu, ý chính từ bài viết, CTA và hashtag; không tự đăng lên mạng xã hội." />
        {roleTasks.some((task) => task.operation === "content.repurpose" && task.status === "pending" && task.campaign_id) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Có task Content đang chờ duyệt bài SEO. Mở Review Queue, kiểm tra và duyệt đúng bài SEO để worker tự tạo caption.</p>}
        <div className="mt-4 flex flex-wrap gap-4"><Link href="/review-queue" className="text-sm font-semibold text-blue-700">Mở Review Queue →</Link><Link href="/agents/seo" className="text-sm font-semibold text-blue-700">Xem bài SEO đầu vào →</Link><button onClick={reload} className="text-sm font-semibold text-blue-700">Cập nhật caption</button></div>
        {waitingTaskId && <p className="mt-4 text-sm text-blue-800">Content đang tạo caption… Kết quả sẽ tự cập nhật.</p>}
        {latestArtifact?.operation === "content.repurpose" ? <>
          <ArtifactReviewContent artifact={latestArtifact} />
          <button onClick={async () => { try { await navigator.clipboard.writeText(valueText((latestArtifact.payload.result as Record<string, unknown> | undefined)?.caption)); setNotice("Đã sao chép caption."); } catch { setNotice("Không sao chép được. Bạn có thể chọn và sao chép nội dung caption trực tiếp."); } }} className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700">Sao chép caption</button>
          {facebookPost && <button onClick={async () => { try { await navigator.clipboard.writeText(facebookPost); setNotice("Đã sao chép bài Facebook."); } catch { setNotice("Không sao chép được. Bạn có thể chọn và sao chép nội dung bài Facebook trực tiếp."); } }} className="ml-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Sao chép bài Facebook</button>}
        </> : <p className="mt-4 text-sm text-slate-600">Chưa có caption mới từ bài SEO. Caption sẽ xuất hiện tại đây và Review Queue sau khi worker xử lý.</p>}
        {notice && <p role="status" className="mt-3 text-sm text-blue-800">{notice}</p>}
      </section>}
      {(role === "seo" || role === "growth_lead") && data && <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <SectionTitle title="Kế hoạch đã duyệt → SEO" subtitle="SEO nhận brief, CTA và nguồn Research từ đúng kế hoạch đã duyệt. Nội dung được tạo ở dạng nháp; Content chờ duyệt bài SEO." />
        <label className="mt-4 block text-sm font-semibold">Kế hoạch Growth Lead<select aria-label="Kế hoạch Growth Lead" value={chosenPlan?.id ?? ""} onChange={(event) => setPlanId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="" disabled>Chưa có kế hoạch đã duyệt trong context hiện tại</option>{approvedPlans.map((item) => <option key={item.id} value={item.id}>{formatDate(item.created_at)} · {item.id.slice(0, 8)}</option>)}</select></label>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={startSeo} disabled={!canEdit || !chosenPlan || submitting || !!waitingTaskId} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Bàn giao và chạy SEO</button><Link href={role === "seo" ? "/review-queue" : "/agents/seo"} className="text-sm font-semibold text-blue-700">{role === "seo" ? "Mở Review Queue →" : "Mở SEO Worker →"}</Link></div>
        {!chosenPlan && <p className="mt-3 text-sm text-amber-800">Duyệt kế hoạch Growth Lead trong Review Queue trước khi chạy SEO.</p>}
        {role === "seo" && notice && <p role="status" className="mt-4 text-sm text-blue-800">{notice}</p>}
        {role === "seo" && waitingTaskId && <p className="mt-2 text-sm text-blue-800">Đang tạo bài SEO… Kết quả sẽ tự cập nhật.</p>}
        {role === "seo" && latestArtifact && <ArtifactReviewContent artifact={latestArtifact} />}
      </section>}
      {role === "research" && <ResearchDiscoveryPanel workspaceId={workspace.id} canEdit={canEdit} canApprove={canApprove} onContextChanged={reload} />}
      {(role === "research" || role === "growth_lead") && data && <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <SectionTitle title="Research → Growth Lead" subtitle="Chạy nghiên cứu từ nguồn đã duyệt, chọn kết quả và bàn giao để tạo kế hoạch. Dữ liệu mẫu và dữ liệu thật dùng chung luồng; kế hoạch vẫn cần người duyệt." />
        <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={runResearch} disabled={!canEdit || !contextId || !approvedSources || submitting || !!waitingTaskId} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Chạy Research mới</button><Link href={role === "research" ? "/agents/growth_lead" : "/agents/research"} className="text-sm font-semibold text-blue-700">{role === "research" ? "Mở Growth Lead →" : "Mở Research →"}</Link></div>
        <form onSubmit={handoffResearch} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Kết quả Research để bàn giao<select aria-label="Kết quả Research để bàn giao" value={chosenResearch?.id ?? ""} onChange={(event) => setResearchId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="" disabled>Chưa có Research sẵn sàng trong context hiện tại</option>{availableResearch.map((item) => <option key={item.id} value={item.id}>{formatDate(item.created_at)} · {item.id.slice(0, 8)}{(item.payload.result as Record<string, unknown>)?.synthetic ? " · Demo" : ""}</option>)}</select></label>
          <label className="block text-sm font-semibold">CTA cho kế hoạch<input aria-label="CTA cho kế hoạch" required maxLength={200} value={cta} onChange={(event) => setCta(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
          <label className="block text-sm font-semibold">Hạn hoàn thành<input aria-label="Hạn hoàn thành" type="datetime-local" required value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-2 block rounded-lg border border-slate-300 p-2 text-sm" /></label>
          <button disabled={!canEdit || !chosenResearch || !cta.trim() || submitting || !!waitingTaskId} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Bàn giao và chạy Growth Lead</button>
        </form>
        {!availableResearch.length && <p className="mt-3 text-sm text-amber-800">Chạy Research trước. Kết quả phải có finding và trạng thái sẵn sàng bàn giao.</p>}
        {notice && <p role="status" className="mt-4 text-sm text-blue-800">{notice}</p>}
        {waitingTaskId && <p role="status" className="mt-2 text-sm text-blue-800">{waitingMessage}</p>}
        {chosenResearch && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Xem Research được bàn giao</summary><ArtifactReviewContent artifact={chosenResearch} /></details>}
        {role === "growth_lead" && latestArtifact?.operation === "strategy.generate" && <ArtifactReviewContent artifact={latestArtifact} />}
      </section>}
      {role === "growth_lead" && data && <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <SectionTitle title="Performance → Learning → Research vòng mới" subtitle="Đóng vòng học từ số liệu first-party. Learning chỉ đề xuất; owner duyệt mới mở vòng Research tiếp theo, tối đa ba vòng và không trùng lặp." />
        <ol className="mt-5 space-y-4">
          <li className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">1. Số liệu và báo cáo Performance</p>
            <p className="mt-1 text-xs text-slate-600">{performanceDraft ? `Báo cáo nháp ${formatDate(performanceDraft.created_at)}` : "Chưa có báo cáo Performance nháp trong context hiện tại."} · {leadAggregate ? `Lead aggregate ${formatDate(leadAggregate.created_at)}` : "Chưa có lead aggregate."}</p>
            <button onClick={runPerformanceForLearning} disabled={!canEdit || !contextId || submitting || !!waitingTaskId} className="mt-3 rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">Chụp số liệu và chạy Performance</button>
          </li>
          <li className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">2. Learning (vòng {loopIteration}/{MAX_LEARNING_ITERATIONS})</p>
            <p className="mt-1 text-xs text-slate-600">Growth Lead đọc báo cáo Performance và lead aggregate; không suy diễn nhân quả hoặc ROI.</p>
            <button onClick={runLearning} disabled={!canEdit || !contextId || !performanceDraft || !leadAggregate || loopIteration >= MAX_LEARNING_ITERATIONS || submitting || !!waitingTaskId} className="mt-3 rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">Chạy Learning</button>
            {(!performanceDraft || !leadAggregate) && <p className="mt-2 text-xs text-amber-800">Cần báo cáo Performance nháp và lead aggregate cùng context; chạy bước 1 trước.</p>}
          </li>
          <li className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">3. Duyệt learning và mở vòng Research</p>
            {latestLearning && learningReport ? <div className="mt-2 space-y-2 text-sm text-slate-700">
              <p className="text-xs text-slate-500">{formatDate(latestLearning.created_at)} · {learningReport.status === "draft" ? "Learning nháp" : "Thiếu dữ liệu"}</p>
              <ul className="space-y-1">{(learningReport.learning ?? []).map((item) => <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">{item}</li>)}</ul>
              {learningReport.next_tasks?.[0] && <p>Đề xuất: Research vòng {learningReport.next_tasks[0].iteration}. {learningReport.next_tasks[0].reason}</p>}
              {learningReport.stopped_reason && <p className="text-amber-800">Dừng: {learningStopLabels[learningReport.stopped_reason] ?? learningReport.stopped_reason}</p>}
              {!!learningReport.missing_facts?.length && <p className="text-amber-800">Dữ liệu còn thiếu: {learningReport.missing_facts.join(", ")}</p>}
            </div> : <p className="mt-1 text-xs text-slate-600">Chưa có learning trong context hiện tại.</p>}
            {openedRound ? <p className="mt-3 text-sm text-emerald-800">Đã mở Research vòng {String(openedRound.payload.iteration)} · {statusLabels[openedRound.status] ?? openedRound.status}. <Link href="/agents/research" className="font-semibold text-blue-700 hover:underline">Mở Research →</Link></p>
              : <button onClick={openNextRound} disabled={!canApprove || !canOpenRound || submitting} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Duyệt learning và mở vòng Research mới</button>}
            {!canApprove && <p className="mt-2 text-xs text-amber-800">Chỉ owner được duyệt learning.</p>}
          </li>
        </ol>
        {loopNotice && <p role="status" className="mt-4 text-sm text-blue-800">{loopNotice}</p>}
      </section>}
      {role === "community" && data && <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <SectionTitle title="Soạn phản hồi Community" subtitle="Nhập câu hỏi hoặc comment. Agent sử dụng nguồn đã duyệt để soạn nháp; không tự gửi phản hồi lên mạng xã hội." />
        <form onSubmit={submitCommunity} className="mt-5 space-y-3">
          <label htmlFor="community-question" className="block text-sm font-semibold">Câu hỏi cần phản hồi</label>
          <textarea id="community-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} required rows={4} disabled={!canEdit || submitting} className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{question.length}/1000 ký tự</p><button type="submit" disabled={!canEdit || !contextId || !approvedSources || !question.trim() || submitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Đang gửi…" : "Tạo phản hồi nháp"}</button></div>
          {!canEdit && <p className="text-sm text-amber-800">Cần quyền owner hoặc editor để tạo phản hồi.</p>}
          {notice && <p role="status" className="text-sm text-blue-800">{notice}</p>}
        </form>
        {waitingTaskId && <p role="status" className="mt-4 text-sm text-blue-800">Đang xử lý câu hỏi mới…</p>}
        {communityArtifact?.operation === "community.response" && <div className="mt-6 space-y-3 rounded-lg bg-slate-50 p-4">
          <h3 className="font-semibold">Phản hồi gần nhất</h3>
          <label htmlFor="community-reply" className="block text-sm font-semibold">Lịch sử phản hồi</label>
          <select id="community-reply" value={communityArtifact.id} onChange={(event) => setSelectedReplyId(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm">{roleArtifacts.filter((item) => item.operation === "community.response").map((item) => <option key={item.id} value={item.id}>{formatDate(item.created_at)} · {valueText((roleTasks.find((task) => task.id === item.task_id)?.payload.input as Record<string, unknown> | undefined)?.question) || item.id.slice(0, 12)}</option>)}</select>
          <p className="whitespace-pre-wrap text-sm">{valueText(communityResult?.reply) || "Chưa có nội dung phản hồi."}</p>
          <p className="text-sm font-semibold">{communityResult?.status === "insufficient_data" ? "Thiếu dữ liệu" : "Phản hồi nháp"}{communityResult?.synthetic === true ? " · Demo (AI mô phỏng)" : ""}</p>
          {communityResult?.escalation_required === true && <p className="text-sm text-amber-800">Chưa đủ thông tin xác minh. Cần người phụ trách xử lý trước khi trả lời khách.</p>}
          <p className="text-sm text-slate-700">Dữ liệu còn thiếu: {Array.isArray(communityResult?.missing_facts) && communityResult.missing_facts.length ? communityResult.missing_facts.map((item) => item === "grounded_answer" ? "Chưa tìm thấy nguồn đã duyệt phù hợp với câu hỏi" : item === "verified_lead_owner_and_consent" ? "Chưa xác minh người phụ trách và sự đồng ý của khách" : String(item)).join("; ") : "Không có mục thiếu được báo cáo."}</p>
          <p className="text-xs text-slate-600">{communityEvidence.length} trích dẫn nguồn · Chưa tự gửi cho khách</p>
          {!communityEvidence.length && <p className="text-sm text-amber-800">Không có trích dẫn phù hợp. Cần bổ sung nguồn đã duyệt; không tạo trích dẫn giả.</p>}
          {communityEvidence.map((item, index) => <blockquote key={index} className="border-l-2 border-blue-300 pl-3 text-sm text-slate-600"><p>{valueText(item.quote)}</p><p className="mt-1 text-xs">{valueText(item.source_url)} · {valueText(item.locator)}</p></blockquote>)}
          {communityResult?.lead_proposal != null ? <div className="text-sm text-amber-800"><p>Có đề xuất lead. Cần người phụ trách xác minh sự đồng ý của khách trước khi lưu hoặc liên hệ.</p><p>Ý định: {valueText((communityResult.lead_proposal as Record<string, unknown>).intent)} · Trạng thái: đề xuất, chưa lưu lead.</p></div> : <p className="text-sm text-slate-600">Chưa có đề xuất lead từ câu hỏi này.</p>}
          <Link href="/review-queue" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Xem và duyệt phản hồi →</Link>
        </div>}
      </section>}
      {!data && loading && <LoadingBlock label="Đang tải dữ liệu vận hành của agent…" />}
      {data && <>
        {data.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Một số nguồn phụ chưa tải được: {data.warnings.join(", ")}. Các phần còn lại vẫn hiển thị theo dữ liệu thực có.</div>}
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Cách agent hoạt động" subtitle="Chu trình thực tế của role này trong pipeline." /><div className="mt-5 space-y-3">{config.steps.map((step, index) => <div key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span><p className="pt-1 text-sm text-slate-700">{step}</p></div>)}</div><div className="mt-6 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operations được phép</p><div className="mt-2 flex flex-wrap gap-2">{config.operations.map((operation) => <code key={operation} className="rounded-md bg-white px-2 py-1 text-xs text-blue-800 shadow-sm ring-1 ring-slate-200">{operation}</code>)}</div></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Đầu vào và điều kiện" subtitle="Xanh: đã có. Vàng: cần bổ sung cho bước được mô tả. Đỏ: thiếu đầu vào để chạy agent." /><div className="mt-5 space-y-3">{requirements.map((item) => <Check key={item.label} {...item} />)}</div></section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Input / output contract" subtitle="Danh sách kiểm tra theo contract của agent." /><div className="mt-5 grid gap-5 md:grid-cols-2"><Contract title="Input cần có" items={config.inputs} /><Contract title="Output đạt chuẩn" items={config.outputs} /></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Cần cải thiện" subtitle="Ưu tiên được suy ra từ trạng thái thật của workspace." /><ul className="mt-5 space-y-3">{[...(!contextId || !approvedSources ? ["Tạo current knowledge context từ source approved trước khi chạy."] : []), ...(failedTasks.length ? [`Xử lý ${failedTasks.length} task lỗi và xem error_details trước khi retry.`] : []), ...(pendingApprovals.length ? [`Có ${pendingApprovals.length} approval pending; cần owner review trước handoff.`] : []), ...config.improvements].slice(0, 6).map((item) => <li key={item} className="flex gap-3 text-sm text-slate-700"><span className="mt-1 text-blue-600">→</span><span>{item}</span></li>)}</ul></section>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><SectionTitle title="Đầu ra gần nhất" subtitle="Artifact mới nhất, version/hash và bằng chứng để kiểm tra chất lượng." />{latestArtifact ? <div className="mt-5 rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{latestArtifact.title || latestArtifact.artifact_type}{(latestArtifact.payload.synthetic === true || (latestArtifact.payload.result as { synthetic?: boolean } | undefined)?.synthetic === true || latestTask?.payload?.synthetic === true) && <span className="ml-2 text-xs text-amber-700">Demo (synthetic)</span>}</h3><p className="mt-1 text-xs text-slate-500">{latestArtifact.operation} · tạo {formatDate(latestArtifact.created_at)}</p></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">v{latestArtifact.version}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Info label="Artifact ID" value={latestArtifact.id.slice(0, 16)} /><Info label="Context" value={latestArtifact.context_snapshot_id?.slice(0, 16) ?? "Thiếu"} /><Info label="Citation/evidence" value={String(artifactCitations)} /></div><p className="mt-4 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">SHA-256: {latestArtifact.content_hash}</p><Link href="/artifacts" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">Mở toàn bộ artifact ledger →</Link></div> : <Empty title="Agent chưa tạo artifact" description="Hãy chạy upstream task và kiểm tra các điều kiện màu đỏ ở trên." />}</section>
        {role === "performance" && performanceReport && <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6"><SectionTitle title="Performance report" subtitle="Số liệu lấy nguyên từ metric snapshot; không suy diễn ROI hoặc causal impact." /><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(performanceReport.metrics ?? {}).map(([metric, value]) => <Metric key={metric} label={metric.replaceAll("_", " ")} value={value === null || value === undefined ? "Chưa có dữ liệu" : value.toLocaleString("en-US")} tone={value === null || value === undefined ? "red" : "green"} />)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="space-y-3"><Info label="Status" value={performanceReport.status ?? "unknown"} /><Info label="Metric snapshot" value={performanceReport.metric_snapshot_id ?? "Thiếu"} /><Info label="Window" value={performanceReport.window ? `${formatDate(performanceReport.window.start)} → ${formatDate(performanceReport.window.end)}` : "Thiếu"} /><Info label="Spend mutation" value={performanceReport.spend_mutation_allowed === false ? "Disabled" : "Blocked by contract"} /></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Observations</p><ul className="mt-3 space-y-2 text-sm text-slate-700">{(performanceReport.observations ?? []).map((item) => <li key={item} className="rounded-lg bg-white px-3 py-2">{item}</li>)}{!performanceReport.observations?.length && <li className="text-slate-500">Chưa có observation.</li>}</ul>{performanceReport.missing_facts?.length ? <p className="mt-4 text-sm text-amber-800">Missing facts: {performanceReport.missing_facts.join(", ")}</p> : null}<p className="mt-4 text-sm font-semibold text-slate-800">{performanceReport.proposal ?? "Chưa có proposal vì dữ liệu chưa đủ."}</p></div></div>{performanceReport.experiment && <div className="mt-5 rounded-xl border border-blue-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Experiment hypothesis</p><p className="mt-2 text-sm font-semibold text-slate-900">{performanceReport.experiment.hypothesis}</p><div className="mt-3 grid gap-3 text-sm md:grid-cols-2"><Info label="Control" value={performanceReport.experiment.control_variant} /><Info label="Treatment" value={performanceReport.experiment.treatment_variant} /><Info label="Primary metric" value={performanceReport.experiment.primary_metric} /><Info label="Grouping" value={performanceReport.experiment.grouping} /><Info label="Period" value={`${formatDate(performanceReport.experiment.period.start)} → ${formatDate(performanceReport.experiment.period.end)}`} /></div></div>}</section>}
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><SectionTitle title="Task và lỗi gần đây" subtitle="Đây là log vận hành thực tế của role, không phải trạng thái demo." />{notice && <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</span>}</div>{roleTasks.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Operation</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Queue</th><th className="px-4 py-3">Bắt đầu</th><th className="px-4 py-3">Lỗi</th><th className="px-4 py-3" /></tr></thead><tbody>{roleTasks.slice(0, 20).map((task) => <tr key={task.id} className="border-t border-slate-100 align-top"><td className="px-4 py-4"><p className="font-semibold text-slate-900">{task.operation}{task.payload?.synthetic === true && <span className="ml-2 text-xs text-amber-700">Demo</span>}</p><p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}</p></td><td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(task.status)}`}>{statusLabels[task.status] ?? task.status}</span></td><td className="px-4 py-4 text-xs text-slate-500">{valueText((task as WorkflowTask & { queue_status?: string }).queue_status) || "—"}<br />attempt {String((task as WorkflowTask & { attempts?: number }).attempts ?? task.retry_count)}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDate(task.started_at ?? task.created_at)}</td><td className="max-w-xs px-4 py-4 text-xs text-red-700">{task.error_details ? <pre className="whitespace-pre-wrap">{JSON.stringify(task.error_details)}</pre> : "—"}</td><td className="px-4 py-4">{task.status === "failed" && canApprove && <button disabled={retrying === task.id} onClick={() => retry(task)} className="whitespace-nowrap rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50">{retrying === task.id ? "Đang retry…" : "Retry"}</button>}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có task cho agent này" description="Agent chỉ xuất hiện ở đây khi worker nhận đúng operation trong workspace." />}</section>
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
