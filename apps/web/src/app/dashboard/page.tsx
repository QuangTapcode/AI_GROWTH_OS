import type { Metadata } from "next";
import DashboardView from "@/components/dashboard/DashboardView";

export const metadata: Metadata = {
  title: "Dashboard · TripC Da Nang | AI Growth OS",
  description: "Manage your workspace, business context and team permissions in AI Growth OS.",
};

export default async function DashboardPage(props: {
  searchParams?: Promise<{ tab?: string; view?: string; sidebar?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialTab =
    searchParams?.tab === "workspace"
      ? "workspace"
      : searchParams?.tab === "ai-context"
      ? "ai-context"
      : "members";

  const initialMainView =
    searchParams?.view === "knowledge-base"
      ? "knowledge-base"
      : "dashboard";

  const initialSidebarItem =
    searchParams?.sidebar ||
    (searchParams?.view === "knowledge-base"
      ? "dashboard"
      : searchParams?.tab
      ? "dashboard"
      : "growth-goals");

  return (
    <DashboardView
      initialTab={initialTab}
      initialMainView={initialMainView}
      initialSidebarItem={initialSidebarItem}
    />
  );
}
