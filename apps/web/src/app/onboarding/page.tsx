'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { ZeroTechOnboarding } from '@/features/onboarding/ZeroTechOnboarding';

function OnboardingContent() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <ZeroTechOnboarding workspaceId={workspace.id} />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AppShell activeTab="onboarding" pageTitle="Khởi Tạo Phòng Marketing AI (Zero-Tech)">
      <OnboardingContent />
    </AppShell>
  );
}

