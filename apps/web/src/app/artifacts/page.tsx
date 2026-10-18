import React from "react";
import type { Metadata } from "next";
import ArtifactsClientView from "@/features/artifacts/components/ArtifactsClientView";

export const metadata: Metadata = {
  title: "Artifacts · AI Growth OS",
  description:
    "Calibrated strategic deliverables, automated research insights, and growth opportunities.",
};

export default function ArtifactsPage() {
  return <ArtifactsClientView />;
}
