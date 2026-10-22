"use client";

import React, { useMemo, useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { ApiError, growthApi } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import ArtifactsList from "./ArtifactsList";
import ArtifactDetailCanvas from "./ArtifactDetailCanvas";
import EditArtifactModal from "./EditArtifactModal";
import { buildNextVersion, toArtifactDeliverable } from "../adapters";
import { ArtifactDeliverable } from "../types";

function apiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? `${err.message} (${err.code})` : fallback;
}

function ArtifactsContent() {
  const { workspace, user, canEdit, refreshAttention } = useWorkspace();
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [artifacts, approvals, tasks] = await Promise.all([
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listApprovals(workspace.id, signal),
      growthApi.listTasks(workspace.id, signal),
    ]);
    return { artifacts: artifacts.items, approvals: approvals.items, tasks: tasks.items };
  });
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const artifacts = useMemo<ArtifactDeliverable[]>(() => {
    if (!data) return [];
    const tasksById = new Map(data.tasks.map((t) => [t.id, t]));
    return data.artifacts.map((a) =>
      toArtifactDeliverable(a, { approvals: data.approvals, all: data.artifacts, tasksById, workspaceName: workspace.name })
    );
  }, [data, workspace.name]);

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0] ?? null;

  // Lưu chỉnh sửa = tạo artifact version mới (ledger bất biến), rồi chọn version mới
  const handleSaveArtifact = async (artifactId: string, updatedTitle: string, updatedContent: string) => {
    const original = data?.artifacts.find((a) => a.id === artifactId);
    const deliverable = artifacts.find((a) => a.id === artifactId);
    if (!original || !deliverable) throw new Error("This artifact is no longer available. Refresh the page.");
    try {
      const input = await buildNextVersion(original, deliverable.nextVersion, updatedTitle, updatedContent, user.id);
      const created = await growthApi.createArtifact(workspace.id, input);
      setSelectedArtifactId(created.id);
      setToastMessage(`Saved ${deliverable.code} as version v${created.version}.`);
      reload();
    } catch (err) {
      throw new Error(apiMessage(err, "Could not save the new version."), { cause: err });
    }
  };

  const handleSendForReview = async (art: ArtifactDeliverable) => {
    const original = data?.artifacts.find((a) => a.id === art.id);
    if (!original) throw new Error("This artifact is no longer available. Refresh the page.");
    try {
      await growthApi.requestApproval(workspace.id, original);
    } catch (err) {
      throw new Error(apiMessage(err, "Could not send for review."), { cause: err });
    }
    reload();
    refreshAttention();
  };

  const handleExport = () => {
    if (!selectedArtifact) return;
    const raw = data?.artifacts.find((a) => a.id === selectedArtifact.id);
    const blob = new Blob([JSON.stringify(raw ?? selectedArtifact.jsonPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedArtifact.code}_${selectedArtifact.version}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1700px] w-full mx-auto">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* ── Page Header / Operations Title ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Artifacts</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Versioned outputs from the six agents: research briefs, opportunity scores, content briefs and drafts.
          </p>
        </div>

        {/* Right Action Controls: Search + Export */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <div className="relative">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search deliverables..."
              className="w-48 sm:w-56 bg-white border border-slate-200/90 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={!selectedArtifact}
            className="bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading artifacts…" />}

      {data && artifacts.length === 0 && (
        <EmptyBlock
          title="No artifacts yet"
          description="Artifacts appear here when an agent finishes a task and writes its output to the ledger."
        />
      )}

      {/* ── Main 2-Column Artifacts Layout ── */}
      {artifacts.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-4 w-full">
            <ArtifactsList
              artifacts={artifacts}
              selectedArtifactId={selectedArtifact?.id ?? ""}
              onSelectArtifact={(art) => setSelectedArtifactId(art.id)}
              externalQuery={searchFilter}
            />
          </div>

          <div className="xl:col-span-8 w-full">
            {selectedArtifact ? (
              <ArtifactDetailCanvas
                key={selectedArtifact.id}
                artifact={selectedArtifact}
                canEdit={canEdit}
                onOpenEditModal={() => setIsEditModalOpen(true)}
                onSendForReview={handleSendForReview}
              />
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-sm">
                Select a deliverable on the left to inspect its content.
              </div>
            )}
          </div>
        </div>
      )}

      <EditArtifactModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        artifact={selectedArtifact}
        onSave={handleSaveArtifact}
      />
    </main>
  );
}

export default function ArtifactsClientView() {
  return (
    <AppShell activeTab="artifacts" pageTitle="Artifacts">
      <ArtifactsContent />
    </AppShell>
  );
}
