"use client";

import { useState, useMemo } from "react";
import type {
  KnowledgeSource,
  SourceType,
  NewSourcePayload,
} from "../types";
import { INITIAL_SOURCES } from "../constants";

export function useKnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>(INITIAL_SOURCES);
  const [activeTypeTab, setActiveTypeTab] = useState<"All" | SourceType>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 7;

  // Selected source for details drawer
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  // Filter sources
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      const matchesType = activeTypeTab === "All" || s.type === activeTypeTab;
      const matchesCategory = categoryFilter === "all" || s.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.subtitle.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query);

      return matchesType && matchesCategory && matchesStatus && matchesSearch;
    });
  }, [sources, activeTypeTab, categoryFilter, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredSources.length / pageSize) || 1;
  const paginatedSources = useMemo(() => {
    return filteredSources.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredSources, currentPage, pageSize]);

  // KPIs
  const totalSourcesCount = sources.length;
  const processingCount = sources.filter((s) => s.status === "Processing").length;
  const approvedCount = sources.filter((s) => s.status === "Approved").length;
  const needsReviewCount = sources.filter((s) => s.status === "Needs review").length;

  const textCount = sources.filter((s) => s.type === "Text").length;
  const pdfCount = sources.filter((s) => s.type === "PDF").length;
  const urlCount = sources.filter((s) => s.type === "URL").length;

  // Actions
  const addSource = (payload: NewSourcePayload) => {
    let name = payload.title.trim();
    if (!name) {
      if (payload.type === "URL" && payload.url?.trim()) {
        name = payload.url.trim();
      } else if (payload.fileName) {
        name = payload.fileName;
      } else {
        name = "TripC company overview";
      }
    }

    if (payload.type === "PDF" && !name.toLowerCase().endsWith(".pdf")) {
      name = `${name}.pdf`;
    }

    let subtitle = "v1 · Ingesting embeddings";
    if (payload.type === "URL") {
      subtitle = payload.url?.trim()
        ? `${payload.url.trim()} · 1 chunks`
        : "Crawled page · 1 chunks";
    }

    const currentDateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    const newSource: KnowledgeSource = {
      id: `s-${Date.now()}`,
      name,
      subtitle,
      category: payload.category,
      type: payload.type,
      status: "Processing",
      added: currentDateStr,
    };

    setSources((prev) => [newSource, ...prev]);
    setCurrentPage(1);
  };

  const deleteSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (selectedSource?.id === id) {
      setSelectedSource(null);
    }
  };

  const reindexSource = (sourceId: string) => {
    setIsReindexing(true);
    setSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, status: "Processing" } : s))
    );
    if (selectedSource && selectedSource.id === sourceId) {
      setSelectedSource({ ...selectedSource, status: "Processing" });
    }

    setTimeout(() => {
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, status: "Approved" } : s))
      );
      if (selectedSource && selectedSource.id === sourceId) {
        setSelectedSource({ ...selectedSource, status: "Approved" });
      }
      setIsReindexing(false);
    }, 1000);
  };

  return {
    sources,
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
    // KPIs
    totalSourcesCount,
    processingCount,
    approvedCount,
    needsReviewCount,
    textCount,
    pdfCount,
    urlCount,
    // Actions
    addSource,
    deleteSource,
    reindexSource,
  };
}
