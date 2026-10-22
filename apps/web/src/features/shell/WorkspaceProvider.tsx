"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, growthApi } from "@/lib/api";
import type { MeResponse, Role } from "@/lib/apiTypes";
import { clearSession, getSelectedWorkspaceId, getSession, setSelectedWorkspaceId } from "@/lib/session";

export interface WorkspaceMembership {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

interface WorkspaceContextValue {
  user: MeResponse["user"];
  workspaces: WorkspaceMembership[];
  workspace: WorkspaceMembership;
  role: Role;
  canEdit: boolean;
  canApprove: boolean;
  selectWorkspace: (id: string) => void;
  logout: () => void;
  pendingReviewCount: number;
  openExceptionCount: number;
  refreshAttention: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; me: MeResponse };

export default function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [openExceptionCount, setOpenExceptionCount] = useState(0);
  const [attentionVersion, setAttentionVersion] = useState(0);

  useEffect(() => {
    if (!getSession()) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?next=${next}`);
      return;
    }
    const controller = new AbortController();
    growthApi
      .me(controller.signal)
      .then((me) => {
        const stored = getSelectedWorkspaceId();
        const initial = me.workspaces.find((w) => w.workspace_id === stored) ?? me.workspaces[0];
        setSelectedId(initial?.workspace_id ?? null);
        setState({ status: "ready", me });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", error: err instanceof ApiError ? err : new ApiError(0, "UNKNOWN_ERROR", String(err)) });
      });
    return () => controller.abort();
  }, [router, attempt]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    Promise.all([
      growthApi.listApprovals(selectedId, controller.signal),
      growthApi.listExceptions(selectedId, controller.signal),
    ])
      .then(([approvals, exceptions]) => {
        setPendingReviewCount(approvals.items.filter((a) => a.status === "pending").length);
        setOpenExceptionCount(exceptions.items.filter((e) => e.status === "open" || e.status === "investigating").length);
      })
      .catch(() => {
        // Badge là phụ trợ; lỗi tải đã hiển thị ở nội dung trang
      });
    return () => controller.abort();
  }, [selectedId, attentionVersion]);

  const logout = useCallback(() => {
    // Thu hồi phiên phía server trước (token bị từ chối ngay), lỗi mạng vẫn xóa phiên local
    growthApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        clearSession();
        router.replace("/login");
      });
  }, [router]);

  const selectWorkspace = useCallback((id: string) => {
    setSelectedWorkspaceId(id);
    setSelectedId(id);
  }, []);

  const refreshAttention = useCallback(() => setAttentionVersion((v) => v + 1), []);

  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (state.status !== "ready") return null;
    const workspaces = state.me.workspaces.map((w) => ({ id: w.workspace_id, name: w.name, slug: w.slug, role: w.role }));
    const workspace = workspaces.find((w) => w.id === selectedId) ?? workspaces[0];
    if (!workspace) return null;
    return {
      user: state.me.user,
      workspaces,
      workspace,
      role: workspace.role,
      canEdit: workspace.role === "owner" || workspace.role === "editor",
      canApprove: workspace.role === "owner",
      selectWorkspace,
      logout,
      pendingReviewCount,
      openExceptionCount,
      refreshAttention,
    };
  }, [state, selectedId, selectWorkspace, logout, pendingReviewCount, openExceptionCount, refreshAttention]);

  if (state.status === "loading") {
    return (
      <FullScreenMessage title="Loading workspace…" description="Checking your session with the API." />
    );
  }

  if (state.status === "error") {
    return (
      <FullScreenMessage
        title="Cannot load your workspace"
        description={`${state.error.message} (${state.error.code})`}
        action={{
          label: "Try again",
          onClick: () => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          },
        }}
        secondary={{ label: "Sign out", onClick: logout }}
      />
    );
  }

  if (!value) {
    return (
      <FullScreenMessage
        title="No workspace yet"
        description="Your account is not a member of any workspace. Ask a workspace owner to invite you."
        secondary={{ label: "Sign out", onClick: logout }}
      />
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function FullScreenMessage({
  title,
  description,
  action,
  secondary,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans antialiased">
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-8 max-w-md w-full text-center">
        <div className="w-10 h-10 mx-auto rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">AI</div>
        <h1 className="text-lg font-bold text-slate-900 mt-4">{title}</h1>
        <p className="text-sm text-slate-500 mt-2 break-words">{description}</p>
        {(action || secondary) && (
          <div className="flex items-center justify-center gap-2 mt-6">
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                {action.label}
              </button>
            )}
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
