'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import WorkspaceProvider from '@/features/shell/WorkspaceProvider';
import ImmersiveOfficeShell from './ImmersiveOfficeShell';

const UNIFIED_OFFICE_EXCLUDED = ['/login', '/health'];

/**
 * Root boundary mounted in app/layout.tsx:
 * Giữ cho Canvas 3D Office duy nhất tồn tại liên tục khi người dùng chuyển giữa
 * /office, /dashboard, /agents, /workflows, /review-queue, /gmaps, /booking-leads, v.v.
 */
export default function ImmersiveOfficeRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const clean = pathname.replace(/\/+$/, '') || '/';

  const isBypassed =
    clean === '/' || UNIFIED_OFFICE_EXCLUDED.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));

  if (isBypassed) {
    return <>{children}</>;
  }

  return (
    <WorkspaceProvider>
      <ImmersiveOfficeShell>{children}</ImmersiveOfficeShell>
    </WorkspaceProvider>
  );
}
