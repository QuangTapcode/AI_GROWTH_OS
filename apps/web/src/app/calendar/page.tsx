'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { ContentCalendar } from '@/features/calendar/ContentCalendar';

function Content() {
  const { workspace } = useWorkspace();
  return (
    <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
      <ContentCalendar workspaceId={workspace.id} />
    </main>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="calendar" pageTitle="Lịch đăng đa kênh (Agent 3 & 4)">
      <Content />
    </AppShell>
  );
}
