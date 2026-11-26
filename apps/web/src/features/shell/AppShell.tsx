"use client";

import React, { useState } from "react";
import WorkspaceProvider, { useWorkspace } from "./WorkspaceProvider";
import { WalletTopupModal } from "@/features/billing/WalletTopupModal";
import { DailyExecutiveReportModal } from "@/features/reports/DailyExecutiveReportModal";
import { useImmersiveOffice } from "@/features/office/ImmersiveOfficeContext";

interface AppShellProps {
  activeTab: string;
  pageTitle: string;
  searchPlaceholder?: string;
  children: React.ReactNode;
}

function StandaloneHeaderlessLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = useWorkspace();
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col w-full font-sans antialiased text-slate-800">
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <React.Fragment key={workspace.id}>{children}</React.Fragment>
        <WalletTopupModal
          workspaceId={workspace.id}
          isOpen={isWalletOpen}
          onClose={() => setIsWalletOpen(false)}
        />
        <DailyExecutiveReportModal
          workspaceId={workspace.id}
          isOpen={isDailyReportOpen}
          onClose={() => setIsDailyReportOpen(false)}
        />
      </div>
    </div>
  );
}

/**
 * Application Shell adapter:
 * - Khi nằm trong ImmersiveOfficeShell (RootLayout), tuyệt đối không render sidebar trái hay header trùng lặp,
 *   và không bọc lại WorkspaceProvider; chỉ truyền nội dung nghiệp vụ vào Contextual Department Panel.
 * - Không render DashboardSidebar dưới bất kỳ hình thức nào.
 */
export default function AppShell(props: AppShellProps) {
  const { isInsideImmersiveShell } = useImmersiveOffice();

  if (isInsideImmersiveShell) {
    return <>{props.children}</>;
  }

  return (
    <WorkspaceProvider>
      <StandaloneHeaderlessLayout>{props.children}</StandaloneHeaderlessLayout>
    </WorkspaceProvider>
  );
}
