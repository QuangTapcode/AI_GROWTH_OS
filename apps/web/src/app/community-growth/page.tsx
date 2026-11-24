'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { CommunityFunnel } from '@/features/community/CommunityFunnel';

function Content() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <CommunityFunnel workspaceId={workspace.id} />
    </div>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="community-growth" pageTitle="Phễu cộng đồng khách quen (Agent 8)">
      <Content />
    </AppShell>
  );
}
