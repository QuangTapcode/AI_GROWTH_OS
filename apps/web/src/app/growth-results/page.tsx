import React from "react";
import type { Metadata } from "next";
import GrowthResultsClientView from "@/features/growth-results/components/GrowthResultsClientView";

export const metadata: Metadata = {
  title: "Growth Results · AI Growth OS",
  description: "Leads, traffic and published content for the workspace.",
};

export default function GrowthResultsPage() {
  return <GrowthResultsClientView />;
}
