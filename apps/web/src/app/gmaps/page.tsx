'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { GoogleMapsHub } from '@/features/gmaps/GoogleMapsHub';

function GMapsContent() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <GoogleMapsHub workspaceId={workspace.id} />
    </div>
  );
}

export default function GMapsPage() {
  return (
    <AppShell activeTab="gmaps" pageTitle="Google Maps Specialist & Tư Liệu Drive">
      <GMapsContent />
    </AppShell>
  );
}

