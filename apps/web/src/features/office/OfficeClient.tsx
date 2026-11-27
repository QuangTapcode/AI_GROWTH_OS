'use client';

import WorkspaceProvider from '@/features/shell/WorkspaceProvider';
import ImmersiveOfficeShell from './ImmersiveOfficeShell';

/**
 * Route /office: the 3D office as its own full-screen page.
 * The rest of the app keeps the normal sidebar/header shell; picking a room here opens
 * that room's regular page. WorkspaceProvider still requires a signed-in session.
 */
export default function OfficeClient() {
  return (
    <WorkspaceProvider>
      <ImmersiveOfficeShell>{null}</ImmersiveOfficeShell>
    </WorkspaceProvider>
  );
}
