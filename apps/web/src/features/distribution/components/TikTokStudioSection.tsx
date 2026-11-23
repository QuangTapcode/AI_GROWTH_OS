"use client";

import { useEffect, useState } from "react";
import { ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { growthApi } from "@/lib/api";
import type { TikTokVideosResponse } from "@/lib/apiTypes";
import { useApiData } from "@/lib/useApiData";
import TikTokVideoStudio from "./TikTokVideoStudio";

const NOT_CONNECTED: TikTokVideosResponse = {
  connection: {
    connected: false,
    expired: false,
    open_id: null,
    display_name: null,
    avatar_url: null,
    scopes: [],
    expires_at: null,
    refresh_expires_at: null,
    sandbox_privacy_default: "SELF_ONLY",
  },
  items: [],
};

/** TikTok upload & schedule block that loads its own data, so any page can host it. */
export default function TikTokStudioSection({
  workspaceId,
  canEdit,
  returnTo,
}: {
  workspaceId: string;
  canEdit: boolean;
  returnTo: string;
}) {
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const { data, error, loading, reload } = useApiData(workspaceId, async (signal) => {
    const [tikTok, artifacts] = await Promise.all([
      growthApi.listTikTokVideos(workspaceId, signal).catch(() => NOT_CONNECTED),
      growthApi.listArtifacts(workspaceId, signal),
    ]);
    return { tikTok, artifacts: artifacts.items };
  });

  // Back from TikTok's login page: say how it went, then drop the query from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("tiktok") === "connected";
    const failure = params.get("tiktok_error");
    if (!connected && !failure) return;
    const name = params.get("tiktok_name");
    const timer = window.setTimeout(() => {
      setToast(connected
        ? { message: `Đã kết nối tài khoản TikTok thành công${name ? ` (${name})` : ""}.`, tone: "success" }
        : { message: `Lỗi kết nối TikTok: ${failure}`, tone: "error" });
      for (const key of ["tiktok", "tiktok_name", "tiktok_error"]) params.delete(key);
      const rest = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading && !data) return <LoadingBlock label="Đang tải TikTok…" />;
  if (error && !data) return <ErrorBlock error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <TikTokVideoStudio
        workspaceId={workspaceId}
        canEdit={canEdit}
        connection={data.tikTok.connection}
        videos={data.tikTok.items}
        artifacts={data.artifacts}
        onToast={(message) => setToast({ message, tone: "success" })}
        onReload={reload}
        returnTo={returnTo}
      />
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </>
  );
}
