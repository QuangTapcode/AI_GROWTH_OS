'use client';

import AppShell from '@/features/shell/AppShell';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { BookingLeadsHub } from '@/features/booking/BookingLeadsHub';

function BookingLeadsContent() {
  const { workspace } = useWorkspace();
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <BookingLeadsHub workspaceId={workspace.id} />
    </div>
  );
}

export default function BookingLeadsPage() {
  return (
    <AppShell activeTab="booking-leads" pageTitle="Đặt bàn (Agent 7: Booking Concierge)">
      <BookingLeadsContent />
    </AppShell>
  );
}

