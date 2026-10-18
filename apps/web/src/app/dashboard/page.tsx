import React from "react";
import type { Metadata } from "next";
import DashboardClientView from "@/features/dashboard/components/DashboardClientView";

export const metadata: Metadata = {
  title: "TripC / Overview · AI Growth OS",
  description:
    "Growth Command Center - Monitor growth performance, AI activity, and next actions for TripC.",
};

export default function DashboardPage() {
  return <DashboardClientView />;
}
