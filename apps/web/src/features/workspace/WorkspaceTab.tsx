"use client";

import React from "react";
import type { WorkspaceItem } from "@/lib/workspaces";
import styles from "./WorkspaceTab.module.css";
import { WorkspaceInfoCard } from "./components/WorkspaceInfoCard";
import { BusinessInfoCard } from "./components/BusinessInfoCard";
import { BrandInfoCard } from "./components/BrandInfoCard";

interface WorkspaceTabProps {
  workspace: WorkspaceItem;
}

export default function WorkspaceTab({ workspace }: WorkspaceTabProps) {
  return (
    <div className={styles.container}>
      {/* 1. Workspace information card */}
      <WorkspaceInfoCard
        initialData={{
          workspaceName: workspace.name,
          website: workspace.website,
          primaryLanguage: workspace.primaryLanguage,
          organization: workspace.organization,
        }}
      />

      {/* 2. Business information card */}
      <BusinessInfoCard
        initialData={{
          industry: workspace.industry,
          overview: workspace.overview,
        }}
      />

      {/* 3. Brand information card */}
      <BrandInfoCard
        initialData={{
          brandVoice: workspace.brandVoice,
          tone: workspace.tone,
          guidelines: workspace.guidelines,
          forbiddenTerms: workspace.forbiddenTerms,
        }}
      />
    </div>
  );
}
