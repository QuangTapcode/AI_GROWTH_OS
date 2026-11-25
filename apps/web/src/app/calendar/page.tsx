'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { ContentCalendar } from '@/features/calendar/ContentCalendar';

function Content() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <ContentCalendar workspaceId={workspace.id} />
    </div>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="calendar" pageTitle="Lịch đăng đa kênh (Agent 3 & 4)">
      <Content />
    </AppShell>
  );
}
