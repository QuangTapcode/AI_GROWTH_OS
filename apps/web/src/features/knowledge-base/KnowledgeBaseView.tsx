"use client";

import React, { useState } from "react";
import { useKnowledgeBase } from "./hooks/useKnowledgeBase";
import { KnowledgeKpiCards } from "./components/KnowledgeKpiCards";
import { KnowledgeTypeTabs } from "./components/KnowledgeTypeTabs";
import { KnowledgeToolbar } from "./components/KnowledgeToolbar";
import { KnowledgeTable } from "./components/KnowledgeTable";
import { AddSourceModal } from "./components/AddSourceModal";
import { DocumentDetailsDrawer } from "./components/DocumentDetailsDrawer";
import styles from "./KnowledgeBaseView.module.css";

export default function KnowledgeBaseView() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const {
    filteredSources,
    paginatedSources,
    activeTypeTab,
    setActiveTypeTab,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    currentPage,
    setCurrentPage,
    totalPages,
    selectedSource,
    setSelectedSource,
    isReindexing,
    totalSourcesCount,
    processingCount,
    approvedCount,
    needsReviewCount,
    textCount,
    pdfCount,
    urlCount,
    addSource,
    deleteSource,
    reindexSource,
  } = useKnowledgeBase();

  return (
    <div className={styles.container}>
      {/* ── Page Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleBlock}>
          <h1 className={styles.pageTitle}>Business knowledge base</h1>
          <p className={styles.pageSubtitle}>
            Manage the business sources available to AI retrieval.
          </p>
        </div>

        <button
          type="button"
          className={styles.addSourceBtn}
          onClick={() => setIsAddModalOpen(true)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>+ Add source</span>
        </button>
      </div>

      {/* ── 4 KPI Metric Cards ── */}
      <KnowledgeKpiCards
        totalSourcesCount={totalSourcesCount}
        processingCount={processingCount}
        approvedCount={approvedCount}
        needsReviewCount={needsReviewCount}
      />

      {/* ── Source Type Filter Tabs ── */}
      <KnowledgeTypeTabs
        activeTypeTab={activeTypeTab}
        onSelectTypeTab={(tab) => {
          setActiveTypeTab(tab);
          setCurrentPage(1);
        }}
        totalCount={totalSourcesCount}
        textCount={textCount}
        pdfCount={pdfCount}
        urlCount={urlCount}
      />

      {/* ── Toolbar: Search & Filters ── */}
      <KnowledgeToolbar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={(cat) => {
          setCategoryFilter(cat);
          setCurrentPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(st) => {
          setStatusFilter(st);
          setCurrentPage(1);
        }}
      />

      {/* ── Knowledge Sources Table ── */}
      <KnowledgeTable
        sources={paginatedSources}
        totalFilteredCount={filteredSources.length}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        onSelectSource={setSelectedSource}
        onDeleteSource={(id, e) => {
          e.stopPropagation();
          deleteSource(id);
        }}
      />

      {/* ── Modal: Add Source ── */}
      <AddSourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddSource={addSource}
      />

      {/* ── Drawer: Document Details (Source RAG) ── */}
      <DocumentDetailsDrawer
        source={selectedSource}
        isOpen={Boolean(selectedSource)}
        isReindexing={isReindexing}
        onClose={() => setSelectedSource(null)}
        onReindex={reindexSource}
        onDelete={deleteSource}
      />
    </div>
  );
}
