"use client";

import React, { useState } from "react";
import DashboardSidebar, { type WorkspaceItem } from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import { avatarColor, initials, roleLabel } from "@/lib/format";
import WorkspaceProvider, { useWorkspace, type WorkspaceMembership } from "./WorkspaceProvider";
import { WalletTopupModal } from "@/features/billing/WalletTopupModal";
import { DailyExecutiveReportModal } from "@/features/reports/DailyExecutiveReportModal";

interface AppShellProps {
  activeTab: string;
  pageTitle: string;
  searchPlaceholder?: string;
  children: React.ReactNode;
}

function toWorkspaceItem(w: WorkspaceMembership): WorkspaceItem {
  return {
    id: w.id,
    name: w.name,
    subtitle: w.slug,
    initials: initials(w.name),
    avatarBg: avatarColor(w.id),
    tag: roleLabel(w.role),
  };
}

function ShellLayout({ activeTab, pageTitle, searchPlaceholder, children }: AppShellProps) {
  const { user, workspaces, workspace, role, selectWorkspace, logout, pendingReviewCount, openExceptionCount } =
    useWorkspace();
  const shellUser = { name: user.full_name, role: roleLabel(role) };
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const sidebar = (
    <DashboardSidebar
      activeTab={activeTab}
      workspaces={workspaces.map(toWorkspaceItem)}
      selectedWorkspace={toWorkspaceItem(workspace)}
      onWorkspaceChange={(item) => selectWorkspace(item.id)}
      reviewBadge={pendingReviewCount}
      user={shellUser}
      onLogout={logout}
    />
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      <div className="hidden lg:block">{sidebar}</div>
      {/* Điện thoại: menu dạng ngăn kéo, mở bằng nút ☰ */}
      {isMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="max-h-screen overflow-y-auto">{sidebar}</div>
          <button type="button" className="flex-1 bg-slate-900/50" aria-label="Đóng menu" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 bg-[#1d4ed8] text-white px-4 py-2.5">
          <button type="button" onClick={() => setIsMenuOpen(true)} className="rounded-lg border border-white/30 px-2.5 py-1 text-sm" aria-label="Mở menu">
            ☰
          </button>
          <span className="flex-1 min-w-0 truncate text-sm font-semibold">{pageTitle}</span>
          <button type="button" onClick={() => setIsDailyReportOpen(true)} className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold">
            Báo cáo
          </button>
          <button type="button" onClick={() => setIsWalletOpen(true)} className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold">
            Ví
          </button>
        </div>
        <div className="hidden lg:block">
        <DashboardHeader
          workspaceName={workspace.name}
          currentPageTitle={pageTitle}
          searchPlaceholder={searchPlaceholder}
          user={shellUser}
          notificationsCount={pendingReviewCount + openExceptionCount}
          onOpenWallet={() => setIsWalletOpen(true)}
          onOpenDailyReport={() => setIsDailyReportOpen(true)}
        />
        </div>
        {/* key theo workspace: đổi workspace thì nội dung trang tải lại sạch */}
        <React.Fragment key={workspace.id}>{children}</React.Fragment>

        {/* Global Modals for Wallet Top-up & Daily Executive Report */}
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

/** Khung chung cho các trang cần đăng nhập: sidebar + header + nội dung theo workspace đang chọn. */
export default function AppShell(props: AppShellProps) {
  return (
    <WorkspaceProvider>
      <ShellLayout {...props} />
    </WorkspaceProvider>
  );
}
