'use client';

import { useImmersiveOffice } from './ImmersiveOfficeContext';

/**
 * Route /office entrypoint:
 * Khi đang nằm trong ImmersiveOfficeShell thống nhất, toàn bộ không gian 3D & HUD
 * đã được mount cố định ở tầng RootLayout để không bao giờ khởi tạo lại Canvas khi chuyển route.
 */
export default function OfficeClient() {
  const { isInsideImmersiveShell } = useImmersiveOffice();

  if (isInsideImmersiveShell) {
    return null;
  }

  return null;
}
