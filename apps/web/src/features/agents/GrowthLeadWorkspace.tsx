"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Approval, ContentArtifact, SystemException, WorkflowTask } from "@/lib/apiTypes";
import ArtifactReviewContent from "@/features/review-queue/components/ArtifactReviewContent";
import {
  MAX_LEARNING_ITERATIONS,
  formatDate,
  learningStopLabels,
  statusClass,
  statusLabels,
  valueText,
  type LearningReport,
  type Requirement,
} from "./agentShared";

/** Everything the Growth Lead page shows or does; state and API calls stay in AgentDetailView. */
export type GrowthLeadWorkspaceProps = {
  workspaceName: string;
  tasks: WorkflowTask[];
  allTasks: WorkflowTask[];
  artifacts: ContentArtifact[];
  approvals: Approval[];
  exceptions: SystemException[];
  requirements: Requirement[];
  operations: string[];
  contextId: string | null;
  approvedSources: number;
  canEdit: boolean;
  canApprove: boolean;
  submitting: boolean;
  waitingTaskId: string | null;
  waitingMessage: string;
  notice: string;
  loopNotice: string;
  retrying: string | null;
  // Research → plan
  availableResearch: ContentArtifact[];
  chosenResearch?: ContentArtifact;
  onResearchChange: (id: string) => void;
  cta: string;
  onCtaChange: (value: string) => void;
  deadline: string;
  onDeadlineChange: (value: string) => void;
  onRunResearch: () => void;
  onHandoffResearch: (event: FormEvent<HTMLFormElement>) => void;
  // Plan → SEO
  approvedPlans: ContentArtifact[];
  chosenPlan?: ContentArtifact;
  onPlanChange: (id: string) => void;
  onStartSeo: () => void;
  // Learning loop
  performanceDraft?: ContentArtifact;
  leadAggregate?: ContentArtifact;
  loopIteration: number;
  latestLearning?: ContentArtifact;
  learningReport?: Partial<LearningReport>;
  openedRound?: WorkflowTask;
  canOpenRound: boolean;
  onRunPerformance: () => void;
  onRunLearning: () => void;
  onOpenNextRound: () => void;
  onRetry: (task: WorkflowTask) => void;
  onReload: () => void;
};

type Rec = Record<string, unknown>;
const obj = (value: unknown): Rec => (value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const roleNames: Record<string, string> = { research: "Research", seo: "SEO", content: "Content", community: "Community", performance: "Performance", growth_lead: "Growth Lead" };
const operationNames: Record<string, string> = {
  "seo.local_draft": "Viết bài SEO nháp",
  "seo.audit": "Rà soát SEO",
  "content.repurpose": "Chuyển thành bài mạng xã hội",
  "content.generate": "Soạn nội dung",
  "community.response": "Phản hồi cộng đồng",
  "research.run": "Nghiên cứu",
};
const metricNames: Record<string, string> = { leads: "Lead", page_views: "Lượt xem trang", cta_clicks: "Click CTA", sessions: "Phiên truy cập" };
const priorityModes: Record<string, string> = { maintain: "Giữ nhịp", accelerate: "Tăng tốc", recover: "Phục hồi" };

type StepState = "done" | "active" | "waiting" | "todo";
type Step = { key: string; label: string; detail: string; state: StepState };

export default function GrowthLeadWorkspace(props: GrowthLeadWorkspaceProps) {
  const {
    workspaceName, tasks, allTasks, artifacts, approvals, exceptions, requirements, operations, contextId, approvedSources,
    canEdit, canApprove, submitting, waitingTaskId, waitingMessage, notice, loopNotice, retrying,
    availableResearch, chosenResearch, approvedPlans, chosenPlan,
    performanceDraft, leadAggregate, loopIteration, latestLearning, learningReport, openedRound, canOpenRound,
  } = props;

  // Plans of this role, newest first; the page focuses on one, the latest unless another is picked.
  const plans = artifacts.filter((a) => a.role === "growth_lead" && a.operation === "strategy.generate");
  const [planViewId, setPlanViewId] = useState("");
  const plan = plans.find((p) => p.id === planViewId) ?? plans[0];
  const approvalOf = (artifact?: ContentArtifact) =>
    artifact
      ? approvals.find((a) => a.target_id === artifact.id && a.target_version === artifact.version && a.target_hash === artifact.content_hash)
      : undefined;
  const planApproval = approvalOf(plan);
  const planInContext = !!plan && plan.context_snapshot_id === contextId;
  const pendingPlanApprovals = plans.filter((p) => approvalOf(p)?.status === "pending").length;
  const running = tasks.filter((t) => ["queued", "pending", "running"].includes(t.status));
  const failed = tasks.filter((t) => t.status === "failed");
  const researchRunning = allTasks.some((t) => t.operation === "research.run" && ["queued", "running"].includes(t.status));
  const strategyRunning = tasks.some((t) => t.operation === "strategy.generate" && ["queued", "running"].includes(t.status));
  const plansInContext = plans.filter((p) => p.context_snapshot_id === contextId);
  const latestPlanInContext = plansInContext[0];
  const planIsFresh = !!latestPlanInContext && (!chosenResearch || latestPlanInContext.created_at >= chosenResearch.created_at);
  const seoAfterPlan = !!chosenPlan && allTasks.some((t) => t.role === "seo" && t.created_at >= chosenPlan.created_at);
  const contentAfterPlan = !!chosenPlan && allTasks.some((t) => t.role === "content" && t.created_at >= chosenPlan.created_at && t.status === "completed");
  const knowledgeReady = !!contextId && approvedSources > 0;

  const steps: Step[] = [
    { key: "knowledge", label: "Nguồn kiến thức", detail: knowledgeReady ? `${approvedSources} nguồn đã duyệt` : "Chưa có nguồn đã duyệt", state: knowledgeReady ? "done" : "todo" },
    { key: "research", label: "Research", detail: researchRunning ? "Đang nghiên cứu…" : availableResearch.length ? `${availableResearch.length} kết quả sẵn sàng` : "Chưa có kết quả", state: researchRunning ? "active" : availableResearch.length ? "done" : "todo" },
    { key: "plan", label: "Lập kế hoạch", detail: strategyRunning ? "Growth Lead đang lập…" : planIsFresh ? `Bản ${formatDate(latestPlanInContext?.created_at)}` : "Chưa có kế hoạch mới", state: strategyRunning ? "active" : planIsFresh ? "done" : "todo" },
    { key: "approve", label: "Duyệt", detail: approvedPlans.length ? `${approvedPlans.length} kế hoạch đã duyệt` : pendingPlanApprovals ? `${pendingPlanApprovals} chờ duyệt` : "Chưa có kế hoạch cần duyệt", state: approvedPlans.length ? "done" : pendingPlanApprovals ? "waiting" : "todo" },
    { key: "deliver", label: "SEO & Content", detail: contentAfterPlan ? "Đã có bài và caption" : seoAfterPlan ? "Đang viết bài" : "Chưa bàn giao", state: contentAfterPlan ? "done" : seoAfterPlan ? "active" : "todo" },
    { key: "learn", label: "Học & vòng mới", detail: latestLearning ? `Vòng ${loopIteration}/${MAX_LEARNING_ITERATIONS}` : "Chưa chạy", state: openedRound ? "done" : latestLearning ? "waiting" : "todo" },
  ];

  // The one thing to do next, derived from the same facts as the steps.
  let next: { title: string; detail: string; action?: ReactNode };
  const primary = "inline-flex items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";
  if (waitingTaskId) {
    next = { title: "Agent đang xử lý", detail: waitingMessage };
  } else if (!knowledgeReady) {
    next = { title: "Duyệt nguồn kiến thức trước", detail: "Growth Lead chỉ lập kế hoạch từ Research có trích dẫn nguồn đã duyệt.", action: <Link href="/knowledge-contexts" className={primary}>Mở nguồn kiến thức</Link> };
  } else if (!availableResearch.length) {
    next = { title: "Chạy Research để có cơ hội mới", detail: "Chưa có kết quả Research sẵn sàng bàn giao trong context hiện tại.", action: <button onClick={props.onRunResearch} disabled={!canEdit || submitting || researchRunning} className={primary}>Chạy Research mới</button> };
  } else if (!planIsFresh) {
    next = { title: "Lập kế hoạch từ Research mới nhất", detail: `Research ${formatDate(chosenResearch?.created_at)} chưa được bàn giao. Kiểm tra CTA và hạn ở khung bên phải rồi bàn giao.`, action: <a href="#growth-plan-form" className={primary}>Đến khung lập kế hoạch</a> };
  } else if (!approvedPlans.length) {
    next = { title: "Duyệt kế hoạch vừa lập", detail: "Kế hoạch cần owner duyệt trước khi SEO và Content được nhận việc.", action: <Link href="/review-queue" className={primary}>Mở Review Queue</Link> };
  } else if (!seoAfterPlan) {
    next = { title: "Bàn giao kế hoạch đã duyệt cho SEO", detail: "SEO nhận brief, CTA và nguồn từ đúng kế hoạch đã duyệt; Content tự nhận sau khi bài SEO được duyệt.", action: <button onClick={props.onStartSeo} disabled={!canEdit || !chosenPlan || submitting} className={primary}>Bàn giao và chạy SEO</button> };
  } else {
    next = { title: "Đóng vòng học", detail: "Đo kết quả thật, để Growth Lead rút ra bài học và đề xuất vòng Research tiếp theo.", action: <a href="#growth-learning" className={primary}>Đến vòng học</a> };
  }

  const r = obj(plan?.payload.result);
  const opportunity = obj(r.selected_opportunity);
  const alignment = obj(r.strategy_alignment);
  const score = obj(r.opportunity_score);
  const evidence = obj(opportunity.evidence);
  const priority = obj(r.priority);
  const kpis = list(r.kpi_progress).map(obj);
  const planTasks = list(r.tasks).map(obj);
  const community = obj(r.community_growth_plan);
  const weeks = list(community.weekly_targets).map(obj);
  const maxWeek = Math.max(1, ...weeks.map((w) => Number(w.member_target) || 0));
  const missing = list(r.missing_facts).map(String);

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/agents" className="font-semibold text-blue-700 hover:underline">Agent Operations</Link>
          <span aria-hidden>/</span>
          <span>Growth Lead</span>
        </nav>
        <div className="flex gap-2">
          <Link href="/review-queue" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
            Review Queue{pendingPlanApprovals ? ` · ${pendingPlanApprovals}` : ""}
          </Link>
          <button onClick={props.onReload} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Làm mới</button>
        </div>
      </div>

      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6 p-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Agent · {workspaceName}</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">Growth Lead</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Chọn cơ hội có căn cứ từ Research, lập kế hoạch campaign và giao việc cho SEO, Content, Community. Mọi kế hoạch chờ owner duyệt trước khi chạy.
            </p>
          </div>
          <dl className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4">
            <Stat label="Kế hoạch đã lập" value={plans.length} />
            <Stat label="Chờ duyệt" value={pendingPlanApprovals} tone={pendingPlanApprovals ? "amber" : undefined} />
            <Stat label="Đang chạy" value={running.length} tone={running.length ? "blue" : undefined} />
            <Stat label="Task lỗi" value={failed.length} tone={failed.length ? "red" : undefined} />
          </dl>
        </div>

        <ol className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/60 sm:grid-cols-3 lg:grid-cols-6" aria-label="Quy trình Growth Lead">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-start gap-2.5 border-b border-r border-slate-100 px-3 py-3 sm:px-4 lg:border-b-0">
              <StepDot state={step.state} index={index + 1} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                <p className="truncate text-xs text-slate-500" title={step.detail}>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </header>

      <section aria-live="polite" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${waitingTaskId ? "animate-pulse bg-blue-500" : "bg-blue-600"}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Bước tiếp theo</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">{next.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{next.detail}</p>
          </div>
        </div>
        {next.action}
      </section>
      {notice && <p role="status" className="rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-900">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="current-plan-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-6">
            <div>
              <h2 id="current-plan-title" className="text-lg font-bold text-slate-900">Kế hoạch tăng trưởng</h2>
              <p className="mt-1 text-xs text-slate-500">
                {plan ? `Lập ${formatDate(plan.created_at)} · v${plan.version}${planInContext ? "" : " · context cũ"}` : "Chưa có kế hoạch"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {plan && <PlanStatus status={planApproval?.status} />}
              {plans.length > 1 && (
                <select aria-label="Chọn kế hoạch để xem" value={plan?.id ?? ""} onChange={(e) => setPlanViewId(e.target.value)} className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
                  {plans.slice(0, 20).map((p) => <option key={p.id} value={p.id}>{formatDate(p.created_at)} · {p.id.slice(0, 6)}</option>)}
                </select>
              )}
            </div>
          </div>

          {plan ? (
            <div className="space-y-6 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mục tiêu</p>
                <p className="mt-1 text-xl font-semibold leading-snug text-slate-900">{valueText(r.objective) || "Chưa ghi mục tiêu"}</p>
                {Object.keys(priority).length > 0 && (
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{priorityModes[valueText(priority.mode)] ?? valueText(priority.mode)}</span>
                    {valueText(priority.reason)}
                  </p>
                )}
              </div>

              {Object.keys(opportunity).length > 0 && (
                <div className="rounded-xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cơ hội được chọn</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {valueText(alignment.title) || valueText(opportunity.topic)}
                        {valueText(alignment.title) && valueText(opportunity.topic) && <span className="ml-2 rounded-md bg-blue-50 px-2 py-0.5 align-middle text-xs font-semibold text-blue-800">{valueText(opportunity.topic)}</span>}
                      </p>
                    </div>
                    {score.score != null && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-900">{valueText(score.score)}</p>
                        <p className="text-[11px] text-slate-500">điểm {score.estimated === true ? "ước tính" : "cơ hội"}</p>
                      </div>
                    )}
                  </div>
                  {valueText(opportunity.user_need) && <p className="mt-3 text-sm leading-relaxed text-slate-700"><span className="font-semibold">Nhu cầu: </span>{valueText(opportunity.user_need)}</p>}
                  {valueText(opportunity.offer_fit) && <p className="mt-1.5 text-sm leading-relaxed text-slate-700"><span className="font-semibold">Phù hợp dịch vụ: </span>{valueText(opportunity.offer_fit)}</p>}
                  {valueText(evidence.quote) && (
                    <blockquote className="mt-4 border-l-2 border-blue-300 bg-slate-50 py-2 pl-3 pr-2 text-sm text-slate-600">
                      <p>“{valueText(evidence.quote)}”</p>
                      {valueText(evidence.source_url) && (
                        <a href={valueText(evidence.source_url)} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs font-semibold text-blue-700 hover:underline">
                          {valueText(evidence.attribution) || valueText(evidence.source_url)}
                        </a>
                      )}
                    </blockquote>
                  )}
                  {valueText(opportunity.rationale) && <p className="mt-3 text-xs text-slate-500">{valueText(opportunity.rationale)}</p>}
                </div>
              )}

              {kpis.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">KPI</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {kpis.map((kpi, i) => {
                      const target = Number(kpi.target_value) || 0;
                      const current = kpi.current_value == null ? null : Number(kpi.current_value);
                      const pct = current == null || !target ? 0 : Math.min(100, Math.round((current / target) * 100));
                      return (
                        <div key={i} className="rounded-xl bg-slate-50 p-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">{metricNames[valueText(kpi.metric_name)] ?? valueText(kpi.metric_name)}</p>
                            <p className="text-sm text-slate-600"><span className="text-lg font-bold text-slate-900">{current ?? "—"}</span> / {target}</p>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className={`h-full rounded-full ${kpi.status === "reached" ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500">{kpi.status === "reached" ? "Đã đạt mục tiêu" : current == null ? "Chưa đo được" : "Đang tiến tới mục tiêu"}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {planTasks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Giao việc</p>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {planTasks.map((task, i) => {
                      const brief = obj(task.brief);
                      return (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">{roleNames[valueText(task.role)] ?? valueText(task.role)}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{operationNames[valueText(task.operation)] ?? valueText(task.operation)}{valueText(brief.topic) ? ` · ${valueText(brief.topic)}` : ""}</p>
                              {valueText(brief.cta) && <p className="truncate text-xs text-slate-500">CTA: {valueText(brief.cta)}</p>}
                            </div>
                          </div>
                          <span className="text-xs text-slate-500">Hạn {formatDate(valueText(task.deadline) || null)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {weeks.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lộ trình Group 4 tuần</p>
                    <Link href="/agents/community" className="text-xs font-semibold text-blue-700 hover:underline">Đã đồng bộ sang Community Hub →</Link>
                  </div>
                  <ol className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {weeks.map((week, i) => (
                      <li key={i} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-xs font-semibold text-slate-500">Tuần {valueText(week.week) || i + 1}</p>
                        <p className="mt-0.5 text-lg font-bold text-slate-900">{valueText(week.member_target)} <span className="text-xs font-normal text-slate-500">thành viên</span></p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(((Number(week.member_target) || 0) / maxWeek) * 100)}%` }} />
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600" title={valueText(week.focus)}>{valueText(week.focus)}</p>
                      </li>
                    ))}
                  </ol>
                  {valueText(community.rationale) && <p className="mt-2 text-xs leading-relaxed text-slate-500">{valueText(community.rationale)}</p>}
                </div>
              )}

              {missing.length > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Dữ liệu còn thiếu: {missing.join(", ")}</p>
              )}

              <details className="group rounded-xl border border-slate-200">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-blue-700 marker:hidden">
                  <span className="group-open:hidden">Xem toàn bộ dữ liệu kế hoạch</span>
                  <span className="hidden group-open:inline">Thu gọn dữ liệu kế hoạch</span>
                </summary>
                <div className="border-t border-slate-100 p-4"><ArtifactReviewContent artifact={plan} /></div>
              </details>
            </div>
          ) : (
            <Empty title="Chưa có kế hoạch" description="Chạy Research rồi bàn giao cho Growth Lead để tạo kế hoạch đầu tiên." />
          )}
        </section>

        <aside className="space-y-6">
          <section id="growth-plan-form" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Lập kế hoạch mới</h2>
            <p className="mt-1 text-xs text-slate-500">Từ một kết quả Research đã có trích dẫn. Kế hoạch tạo ra vẫn cần duyệt.</p>
            <form onSubmit={props.onHandoffResearch} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">Kết quả Research để bàn giao
                <select aria-label="Kết quả Research để bàn giao" value={chosenResearch?.id ?? ""} onChange={(e) => props.onResearchChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                  <option value="" disabled>Chưa có Research sẵn sàng</option>
                  {availableResearch.map((item) => <option key={item.id} value={item.id}>{formatDate(item.created_at)} · {item.id.slice(0, 8)}{(item.payload.result as Rec | undefined)?.synthetic ? " · Demo" : ""}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">CTA cho kế hoạch
                <input aria-label="CTA cho kế hoạch" required maxLength={200} value={props.cta} onChange={(e) => props.onCtaChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Hạn hoàn thành
                <input aria-label="Hạn hoàn thành" type="datetime-local" required value={props.deadline} onChange={(e) => props.onDeadlineChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <button disabled={!canEdit || !chosenResearch || !props.cta.trim() || submitting || !!waitingTaskId} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Bàn giao và chạy Growth Lead</button>
            </form>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <button onClick={props.onRunResearch} disabled={!canEdit || !contextId || !approvedSources || submitting || !!waitingTaskId} className="text-sm font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">Chạy Research mới</button>
              <Link href="/agents/research" className="text-sm font-semibold text-slate-600 hover:underline">Mở Research →</Link>
            </div>
            {!availableResearch.length && <p className="mt-2 text-xs text-amber-800">Chạy Research trước. Kết quả phải có finding và sẵn sàng bàn giao.</p>}
            {!canEdit && <p className="mt-2 text-xs text-amber-800">Cần quyền owner hoặc editor.</p>}
            {chosenResearch && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700">Xem Research được bàn giao</summary>
                <div className="mt-2 max-h-96 overflow-auto"><ArtifactReviewContent artifact={chosenResearch} /></div>
              </details>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Bàn giao cho SEO</h2>
            <p className="mt-1 text-xs text-slate-500">SEO viết bài nháp theo kế hoạch đã duyệt; Content tự nhận sau khi bài SEO được duyệt.</p>
            <label className="mt-4 block text-xs font-semibold text-slate-700">Kế hoạch Growth Lead
              <select aria-label="Kế hoạch Growth Lead" value={chosenPlan?.id ?? ""} onChange={(e) => props.onPlanChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                <option value="" disabled>Chưa có kế hoạch đã duyệt</option>
                {approvedPlans.map((item) => <option key={item.id} value={item.id}>{formatDate(item.created_at)} · {item.id.slice(0, 8)}</option>)}
              </select>
            </label>
            <button onClick={props.onStartSeo} disabled={!canEdit || !chosenPlan || submitting || !!waitingTaskId} className="mt-3 w-full rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Bàn giao và chạy SEO</button>
            {!chosenPlan && <p className="mt-2 text-xs text-amber-800">Duyệt kế hoạch trong Review Queue trước khi chạy SEO.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Điều kiện chạy</h2>
            <ul className="mt-3 space-y-2.5">
              {requirements.map((item) => (
                <li key={item.label} className="flex gap-2.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.state === "ready" ? "bg-emerald-500" : item.state === "warning" ? "bg-amber-500" : "bg-red-500"}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}<span className="sr-only"> — {item.state === "ready" ? "đã có" : item.state === "warning" ? "cần chú ý" : "còn thiếu"}</span></p>
                    <p className="text-xs leading-relaxed text-slate-500">{item.detail}</p>
                    {item.action && <Link href={item.action.href} className="text-xs font-semibold text-blue-700 hover:underline">{item.action.label} →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section id="growth-learning" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Vòng học: Performance → Learning → Research</h2>
            <p className="mt-1 text-sm text-slate-500">Học từ số liệu thật. Learning chỉ đề xuất; owner duyệt mới mở vòng Research tiếp theo (tối đa {MAX_LEARNING_ITERATIONS} vòng).</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Vòng {loopIteration}/{MAX_LEARNING_ITERATIONS}</span>
        </div>
        <ol className="mt-5 grid gap-4 lg:grid-cols-3">
          <LoopCard index={1} title="Số liệu & báo cáo Performance" done={!!performanceDraft && !!leadAggregate}>
            <p className="text-xs text-slate-600">{performanceDraft ? `Báo cáo ${formatDate(performanceDraft.created_at)}` : "Chưa có báo cáo Performance trong context hiện tại."}</p>
            <p className="text-xs text-slate-600">{leadAggregate ? `Lead aggregate ${formatDate(leadAggregate.created_at)}` : "Chưa có lead aggregate."}</p>
            <button onClick={props.onRunPerformance} disabled={!canEdit || !contextId || submitting || !!waitingTaskId} className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Chụp số liệu và chạy Performance</button>
          </LoopCard>
          <LoopCard index={2} title="Learning" done={!!latestLearning}>
            <p className="text-xs text-slate-600">Growth Lead đọc báo cáo và lead aggregate; không suy diễn nhân quả hay ROI.</p>
            <button onClick={props.onRunLearning} disabled={!canEdit || !contextId || !performanceDraft || !leadAggregate || loopIteration >= MAX_LEARNING_ITERATIONS || submitting || !!waitingTaskId} className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Chạy Learning</button>
            {(!performanceDraft || !leadAggregate) && <p className="mt-2 text-xs text-amber-800">Cần bước 1 trước.</p>}
          </LoopCard>
          <LoopCard index={3} title="Duyệt & mở vòng Research" done={!!openedRound}>
            {latestLearning && learningReport ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p className="text-xs text-slate-500">{formatDate(latestLearning.created_at)} · {learningReport.status === "draft" ? "Learning nháp" : "Thiếu dữ liệu"}</p>
                <ul className="space-y-1">{(learningReport.learning ?? []).slice(0, 3).map((item) => <li key={item} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs">{item}</li>)}</ul>
                {learningReport.next_tasks?.[0] && <p className="text-xs">Đề xuất: Research vòng {learningReport.next_tasks[0].iteration}. {learningReport.next_tasks[0].reason}</p>}
                {learningReport.stopped_reason && <p className="text-xs text-amber-800">Dừng: {learningStopLabels[learningReport.stopped_reason] ?? learningReport.stopped_reason}</p>}
              </div>
            ) : <p className="text-xs text-slate-600">Chưa có learning trong context hiện tại.</p>}
            {openedRound
              ? <p className="mt-3 text-sm text-emerald-800">Đã mở Research vòng {String(openedRound.payload.iteration)} · {statusLabels[openedRound.status] ?? openedRound.status}. <Link href="/agents/research" className="font-semibold text-blue-700 hover:underline">Mở Research →</Link></p>
              : <button onClick={props.onOpenNextRound} disabled={!canApprove || !canOpenRound || submitting} className="mt-3 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Duyệt learning và mở vòng Research mới</button>}
            {!canApprove && <p className="mt-2 text-xs text-amber-800">Chỉ owner được duyệt learning.</p>}
          </LoopCard>
        </ol>
        {loopNotice && <p role="status" className="mt-4 text-sm text-blue-800">{loopNotice}</p>}
      </section>

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:hidden">
          <span>
            <span className="block text-base font-bold text-slate-900">Chi tiết kỹ thuật</span>
            <span className="block text-xs text-slate-500">Task gần đây, lỗi, approval, exception và contract của agent</span>
          </span>
          <span className="flex items-center gap-2">
            {failed.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">{failed.length} lỗi</span>}
            {exceptions.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">{exceptions.length} exception</span>}
            <span className="text-sm font-semibold text-blue-700 group-open:hidden">Mở</span>
            <span className="hidden text-sm font-semibold text-blue-700 group-open:inline">Thu gọn</span>
          </span>
        </summary>
        <div className="space-y-6 border-t border-slate-100 p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Task gần đây của Growth Lead</caption>
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Operation</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Bắt đầu</th><th className="px-3 py-2">Lỗi</th><th className="px-3 py-2"><span className="sr-only">Hành động</span></th></tr>
              </thead>
              <tbody>
                {tasks.slice(0, 12).map((task) => (
                  <tr key={task.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2.5"><p className="font-semibold text-slate-900">{task.operation}</p><p className="font-mono text-[11px] text-slate-400">{task.id.slice(0, 12)}</p></td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass(task.status)}`}>{statusLabels[task.status] ?? task.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDate(task.started_at ?? task.created_at)}</td>
                    <td className="max-w-xs px-3 py-2.5 text-xs text-red-700">{task.error_details ? <code className="whitespace-pre-wrap break-all">{JSON.stringify(task.error_details)}</code> : "—"}</td>
                    <td className="px-3 py-2.5">{task.status === "failed" && canApprove && <button disabled={retrying === task.id} onClick={() => props.onRetry(task)} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 disabled:opacity-50">{retrying === task.id ? "Đang retry…" : "Retry"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tasks.length && <p className="py-4 text-sm text-slate-500">Chưa có task cho Growth Lead.</p>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Kế hoạch đang xem</p>
              {plan ? (
                <dl className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-3"><dt>Artifact</dt><dd className="font-mono">{plan.id.slice(0, 16)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Context</dt><dd className="font-mono">{plan.context_snapshot_id?.slice(0, 16) ?? "Thiếu"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Approval</dt><dd>{planApproval?.status ?? "Chưa có"}</dd></div>
                  <div className="break-all pt-1 font-mono text-[11px] text-slate-500">SHA-256 {plan.content_hash}</div>
                </dl>
              ) : <p className="mt-2 text-xs text-slate-500">Chưa có.</p>}
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Operations</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{operations.map((op) => <code key={op} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-blue-800 ring-1 ring-slate-200">{op}</code>)}</div>
              <Link href="/artifacts" className="mt-3 inline-block text-xs font-semibold text-blue-700 hover:underline">Mở artifact ledger →</Link>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Exception cần xử lý</p>
              {exceptions.length ? (
                <ul className="mt-2 space-y-2">
                  {exceptions.slice(0, 5).map((item) => (
                    <li key={item.id} className="rounded-lg border border-red-100 bg-white p-3">
                      <p className="text-sm font-semibold text-red-900">{item.code} · {item.title}</p>
                      <p className="mt-0.5 text-xs text-red-800">{item.description || "Không có mô tả."}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-xs text-slate-500">Không có exception mở.</p>}
            </div>
          </div>
        </div>
      </details>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "blue" | "red" }) {
  const color = tone === "amber" ? "text-amber-700" : tone === "blue" ? "text-blue-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="min-w-[110px] rounded-xl bg-slate-50 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function StepDot({ state, index }: { state: StepState; index: number }) {
  const styles: Record<StepState, string> = {
    done: "bg-emerald-600 text-white",
    active: "bg-blue-600 text-white animate-pulse",
    waiting: "bg-amber-500 text-white",
    todo: "bg-white text-slate-500 ring-1 ring-slate-300",
  };
  const label: Record<StepState, string> = { done: "xong", active: "đang chạy", waiting: "chờ", todo: "chưa làm" };
  return (
    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${styles[state]}`}>
      {state === "done" ? "✓" : index}
      <span className="sr-only"> ({label[state]})</span>
    </span>
  );
}

function PlanStatus({ status }: { status?: string }) {
  if (status === "approved") return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Đã duyệt</span>;
  if (status === "pending") return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Chờ duyệt</span>;
  if (status === "rejected") return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">Bị từ chối</span>;
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Đề xuất</span>;
}

function LoopCard({ index, title, done, children }: { index: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <li className={`flex flex-col rounded-xl border p-4 ${done ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{done ? "✓" : index}</span>
        {title}
      </p>
      <div className="mt-2 flex flex-1 flex-col items-start gap-1">{children}</div>
    </li>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="m-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}
