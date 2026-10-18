"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import ArtifactsList from "./ArtifactsList";
import ArtifactDetailCanvas from "./ArtifactDetailCanvas";
import EditArtifactModal from "./EditArtifactModal";
import { MOCK_ARTIFACTS } from "../data/artifactsMockData";
import { ArtifactDeliverable } from "../types";

export default function ArtifactsClientView() {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("artifacts");
  const [artifacts, setArtifacts] = useState<ArtifactDeliverable[]>(MOCK_ARTIFACTS);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(MOCK_ARTIFACTS[0].id);
  const [searchFilter, setSearchFilter] = useState("Central Vietnam");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedArtifact =
    artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0];

  // Save changes handler from EditArtifactModal
  const handleSaveArtifact = (
    artifactId: string,
    updatedTitle: string,
    updatedContent: string
  ) => {
    setArtifacts((prev) =>
      prev.map((art) => {
        if (art.id === artifactId) {
          // Increment version (e.g., v3 -> v4)
          const match = art.version.match(/v(\d+)/i);
          const nextVersion = match ? `v${parseInt(match[1], 10) + 1}` : `${art.version}.1`;

          return {
            ...art,
            title: updatedTitle,
            documentContent: updatedContent,
            version: nextVersion,
            versionsCount: art.versionsCount + 1,
            pipeline: {
              ...art.pipeline,
              outputPreviewText: `Output: ${art.code} ${nextVersion} - ${updatedTitle}`,
            },
          };
        }
        return art;
      })
    );

    setToastMessage(`Saved changes! Created new version snapshot (${selectedArtifact.version} → v4).`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSendForReview = (art: ArtifactDeliverable) => {
    setToastMessage(`Artifact "${art.title}" sent to Review Queue successfully!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleExport = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(selectedArtifact, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${selectedArtifact.code}_export.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setToastMessage(`Exported ${selectedArtifact.code} package successfully.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      {/* ── Left Sidebar (Cobalt Theme) ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Artifacts"
        />

        {/* Main Canvas */}
        <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1700px] w-full mx-auto">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-xl font-medium flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Page Header / Operations Title ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  Artifacts
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  AI Workspace
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Calibrated strategic deliverables, automated research insights, and growth opportunities.
              </p>
            </div>

            {/* Right Action Controls: Search + Export + Send for Review */}
            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              {/* Central Vietnam Search Pill */}
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

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExport}
                className="bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export</span>
              </button>

              {/* Send for review primary CTA */}
              <button
                type="button"
                onClick={() => handleSendForReview(selectedArtifact)}
                className="bg-[#1e3a8a] hover:bg-[#1e40af] active:bg-blue-900 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm shadow-blue-900/25 transition-all cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5 fill-current"
                  viewBox="0 0 24 24"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
                <span>Send for review</span>
              </button>
            </div>
          </div>

          {/* ── Main 2-Column Artifacts Layout ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: DELIVERABLES List (col-span-4) */}
            <div className="xl:col-span-4 w-full">
              <ArtifactsList
                artifacts={artifacts}
                selectedArtifactId={selectedArtifactId}
                onSelectArtifact={(art) => setSelectedArtifactId(art.id)}
              />
            </div>

            {/* Right Column: Main Deliverable Details & Pipeline (col-span-8) */}
            <div className="xl:col-span-8 w-full">
              {selectedArtifact ? (
                <ArtifactDetailCanvas
                  artifact={selectedArtifact}
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
        </main>
      </div>

      {/* ── Edit Artifact Modal (Image 2) ── */}
      <EditArtifactModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        artifact={selectedArtifact}
        onSave={handleSaveArtifact}
      />
    </div>
  );
}
