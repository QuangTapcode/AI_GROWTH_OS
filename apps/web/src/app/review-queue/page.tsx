import React from "react";
import type { Metadata } from "next";
import ReviewQueueClientView from "@/features/review-queue/components/ReviewQueueClientView";

export const metadata: Metadata = {
  title: "Review Queue · AI Growth OS",
  description:
    "Review AI-generated outputs that require your approval before autonomous production execution.",
};

export default function ReviewQueuePage() {
  return <ReviewQueueClientView />;
}
