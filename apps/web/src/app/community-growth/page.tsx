'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import CommunityGrowthHub from '@/features/agents/CommunityGrowthHub';
import { CommunityFunnel } from '@/features/community/CommunityFunnel';

function Content() {
  const { workspace, canEdit } = useWorkspace();
  return (
    <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
      <CommunityGrowthHub workspaceId={workspace.id} canEdit={canEdit} />
      <CommunityFunnel workspaceId={workspace.id} />
    </main>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="community-growth" pageTitle="Cộng đồng khách quen (Agent 8)">
      <Content />
    </AppShell>
  );
}
