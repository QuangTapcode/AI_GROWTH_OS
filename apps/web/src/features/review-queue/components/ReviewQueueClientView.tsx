"use client";

import React, { useMemo, useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/features/shell/StatusViews";
import { ApiError, growthApi } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import ReviewItemsList from "./ReviewItemsList";
import ReviewDetailView from "./ReviewDetailView";
import { reviewStats, toReviewItem } from "../adapters";

function ReviewQueueContent() {
  const { workspace, canApprove, refreshAttention } = useWorkspace();
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [approvals, artifacts, tasks] = await Promise.all([
      growthApi.listApprovals(workspace.id, signal),
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listTasks(workspace.id, signal),
    ]);
    return { approvals: approvals.items, artifacts: artifacts.items, tasks: tasks.items };
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const artifactsById = new Map(data.artifacts.map((a) => [a.id, a]));
    const tasksById = new Map(data.tasks.map((t) => [t.id, t]));
    return {
      items: data.approvals.map((a) => toReviewItem(a, artifactsById, tasksById)),
      stats: reviewStats(data.approvals),
    };
  }, [data]);

  const items = view?.items ?? [];
  const selectedItem =
    items.find((i) => i.id === selectedItemId) ?? items.find((i) => i.status === "pending") ?? items[0];

  const decide = async (approvalId: string, decision: "approve" | "reject", note: string) => {
    const approval = data?.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new Error("This approval is no longer available. Refresh the queue.");
    try {
      await growthApi.reviewApproval(workspace.id, approval.id, {
        decision,
        expected_version: approval.target_version,
        expected_hash: approval.target_hash,
        review_note: note || null,
      });
    } catch (err) {
      throw new Error(err instanceof ApiError ? `${err.message} (${err.code})` : "The decision could not be saved.", { cause: err });
    }
    setSelectedItemId(approvalId);
    reload();
    refreshAttention();
  };

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1700px] w-full mx-auto">
      {/* ── Page Header / Operations Title ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Review Queue</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-xs">
              Human approval
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Review AI-generated outputs that require your approval before they move forward.
          </p>
        </div>

        {/* Right Summary Stats Indicators */}
        {view && (
          <div className="flex items-center gap-4 flex-wrap bg-white border border-slate-200/90 rounded-2xl px-4 py-2 shadow-2xs text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{view.stats.pendingCount} pending</span>
            </div>
            <span className="text-slate-200">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{view.stats.approvedTodayCount} approved today</span>
            </div>
            <span className="text-slate-200">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{view.stats.rejectedCount} rejected</span>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!view && loading && <LoadingBlock label="Loading review queue…" />}

      {view && items.length === 0 && (
        <EmptyBlock
          title="Nothing to review"
          description="When an editor sends an artifact for review, it appears here for an owner to approve or reject."
        />
      )}

      {/* ── Main 2-Column Review Interface ── */}
      {view && items.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-4 w-full">
            <ReviewItemsList
              items={items}
              selectedItemId={selectedItem?.id ?? ""}
              onSelectItem={(item) => setSelectedItemId(item.id)}
            />
          </div>

          <div className="xl:col-span-8 w-full">
            {selectedItem ? (
              <ReviewDetailView
                key={selectedItem.id}
                item={selectedItem}
                canApprove={canApprove}
                onApprove={(id, note) => decide(id, "approve", note)}
                onReject={(id, reason) => decide(id, "reject", reason)}
              />
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-sm">
                Select an item on the left to begin reviewing.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function ReviewQueueClientView() {
  return (
    <AppShell activeTab="review-queue" pageTitle="Review Queue" searchPlaceholder="Search pipelines, nodes, logs...">
      <ReviewQueueContent />
    </AppShell>
  );
}
