import React from "react";
import type { Metadata } from "next";
import WorkspaceIntegrationsClientView from "@/features/workspace-integrations/components/WorkspaceIntegrationsClientView";

export const metadata: Metadata = {
  title: "TripC / Workspace & Integrations · AI Growth OS",
  description:
    "Manage your core business context, brand voice guidelines, team roles, and external intelligence feeds.",
};

export default function WorkspaceIntegrationsPage() {
  return <WorkspaceIntegrationsClientView />;
}
