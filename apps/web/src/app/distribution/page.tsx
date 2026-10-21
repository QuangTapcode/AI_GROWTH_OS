import React from "react";
import type { Metadata } from "next";
import DistributionClientView from "@/features/distribution/components/DistributionClientView";

export const metadata: Metadata = {
  title: "TripC / Distribution Control Center · AI Growth OS",
  description:
    "Autonomous multi-channel syndication, pre-flight gate validation, and endpoint credential sentinel across TripC network.",
};

export default function DistributionPage() {
  return <DistributionClientView />;
}
