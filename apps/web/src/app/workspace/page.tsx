import React from "react";
import type { Metadata } from "next";
import WorkspaceClientView from "@/features/workspace/components/WorkspaceClientView";

export const metadata: Metadata = {
  title: "Workspace & Integrations · AI Growth OS",
  description: "Business profile, members, connector status and account settings.",
};

export default function WorkspacePage() {
  return <WorkspaceClientView />;
}
