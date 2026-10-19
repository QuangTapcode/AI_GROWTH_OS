import React from "react";
import type { Metadata } from "next";
import DistributionClientView from "@/features/distribution/components/DistributionClientView";

export const metadata: Metadata = {
  title: "Distribution · AI Growth OS",
  description: "Schedule approved content to channels and track publishing.",
};

export default function DistributionPage() {
  return <DistributionClientView />;
}
