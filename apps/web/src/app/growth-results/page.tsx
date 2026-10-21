import React from "react";
import type { Metadata } from "next";
import GrowthResultsClientView from "@/features/growth-results/components/GrowthResultsClientView";

export const metadata: Metadata = {
  title: "TripC / Growth Results · AI Growth OS",
  description:
    "Measure growth performance, understand attribution impact, and identify the next growth opportunities.",
};

export default function GrowthResultsPage() {
  return <GrowthResultsClientView />;
}
