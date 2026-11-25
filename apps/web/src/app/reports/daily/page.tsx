'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { DailyReportView } from '@/features/reports/DailyExecutiveReportModal';

function Content() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <DailyReportView workspaceId={workspace.id} />
    </div>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="daily-report" pageTitle="Báo cáo ngày (Agent 1)">
      <Content />
    </AppShell>
  );
}
