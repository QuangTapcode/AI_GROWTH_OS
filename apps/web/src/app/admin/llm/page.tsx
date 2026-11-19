'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { LLMAdapterAdmin } from '@/features/admin/LLMAdapterAdmin';

function LLMAdminContent() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <LLMAdapterAdmin workspaceId={workspace.id} />
    </div>
  );
}

export default function LLMAdminPage() {
  return (
    <AppShell activeTab="admin-llm" pageTitle="Admin: Cấu Hình Multi-LLM Adapter">
      <LLMAdminContent />
    </AppShell>
  );
}

