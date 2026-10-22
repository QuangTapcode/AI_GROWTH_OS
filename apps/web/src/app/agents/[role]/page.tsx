import AgentDetailView from "@/features/agents/AgentDetailView";

export function generateStaticParams() {
  return [
    { role: "research" },
    { role: "growth_lead" },
    { role: "seo" },
    { role: "content" },
    { role: "community" },
    { role: "performance" },
  ];
}

export default async function AgentRolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return <AgentDetailView role={role} />;
}
