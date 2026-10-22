"use client";

import React from "react";
import DashboardSidebar, { type WorkspaceItem } from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import { avatarColor, initials, roleLabel } from "@/lib/format";
import WorkspaceProvider, { useWorkspace, type WorkspaceMembership } from "./WorkspaceProvider";

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

  return (
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      <DashboardSidebar
        activeTab={activeTab}
        workspaces={workspaces.map(toWorkspaceItem)}
        selectedWorkspace={toWorkspaceItem(workspace)}
        onWorkspaceChange={(item) => selectWorkspace(item.id)}
        reviewBadge={pendingReviewCount}
        user={shellUser}
        onLogout={logout}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <DashboardHeader
          workspaceName={workspace.name}
          currentPageTitle={pageTitle}
          searchPlaceholder={searchPlaceholder}
          user={shellUser}
          notificationsCount={pendingReviewCount + openExceptionCount}
        />
        {/* key theo workspace: đổi workspace thì nội dung trang tải lại sạch */}
        <React.Fragment key={workspace.id}>{children}</React.Fragment>
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
