import React from "react";
import type { Metadata } from "next";
import WorkflowsClientView from "@/features/workflows/components/WorkflowsClientView";

export const metadata: Metadata = {
  title: "Workflows & Tasks · AI Growth OS",
  description:
    "Monitor autonomous growth workflows, agent execution, and tasks requiring attention.",
};

export default function WorkflowsPage() {
  return <WorkflowsClientView />;
}
