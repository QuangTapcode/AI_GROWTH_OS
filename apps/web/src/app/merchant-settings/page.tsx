'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { MerchantSettingsForm } from '@/features/merchant/MerchantSettingsForm';

function Content() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <MerchantSettingsForm workspaceId={workspace.id} />
    </div>
  );
}

export default function Page() {
  return (
    <AppShell activeTab="merchant-settings" pageTitle="Hồ sơ vận hành quán">
      <Content />
    </AppShell>
  );
}
