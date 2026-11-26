"use client";

import React, { useEffect, useState } from "react";
import { formatDateTimeVn, merchantApi, type DriveConnection } from "@/lib/merchantApi";
import { Button, Notice, Pill, useAction, useLoader } from "@/features/merchant/ui";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";

/**
 * Google account + Drive folder for Agent 2 (photos) and Agent 5 (Business Profile).
 * "Kết nối Google" opens Google's consent screen; Google sends the owner back here with ?google=connected.
 */
export function GoogleDriveConnect({
  workspaceId,
  connection,
  onChanged,
}: {
  workspaceId: string;
  connection?: DriveConnection;
  onChanged: () => Promise<void>;
}) {
  const { canApprove: isOwner, canEdit } = useWorkspace();
  const google = useLoader(() => merchantApi.google(workspaceId), [workspaceId]);
  const { busy, notice, setNotice, run } = useAction();
  const folderUrl = connection?.folder_id ? `https://drive.google.com/drive/folders/${connection.folder_id}` : "";
  // null = untouched: show the saved folder until the owner types another link.
  const [draft, setFolder] = useState<string | null>(null);
  const folder = draft ?? folderUrl;

  // Result of the round trip through Google's consent screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("google");
    const error = params.get("google_error");
    if (!ok && !error) return;
    setNotice(ok === "connected" ? { kind: "ok", text: `Đã kết nối Google${params.get("google_email") ? ` (${params.get("google_email")})` : ""}. Bấm “Quét Drive ngay” để lấy ảnh.` } : { kind: "error", text: `Chưa kết nối được Google: ${error}` });
    ["google", "google_error", "google_email"].forEach((k) => params.delete(k));
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void google.reload();
    void onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const g = google.data;
  const connect = () =>
    run("connect", async () => {
      const url = await merchantApi.googleAuthUrl(workspaceId, "/gmaps/?tab=drive_assets");
      window.location.assign(url);
      return "";
    });

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" aria-labelledby="google-drive-connect">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="google-drive-connect" className="text-sm font-bold text-slate-900">Tài khoản Google</h3>
            {g?.source === "workspace" && <Pill tone="green">Đã kết nối</Pill>}
            {g?.source === "server" && <Pill tone="blue">Dùng tài khoản máy chủ</Pill>}
            {g && (g.source === "none" || g.source === "api_key") && <Pill tone="amber">Chưa kết nối</Pill>}
          </div>
          {g?.source === "workspace" ? (
            <p className="text-sm text-slate-700">
              {g.email ?? "Tài khoản Google"} · kết nối {formatDateTimeVn(g.connected_at)}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-slate-600">
              Cấp quyền <b>đọc</b> Google Drive và quản lý Google Business Profile một lần. AI chỉ đọc ảnh trong thư mục bên phải; token được mã hoá trên máy chủ, trình duyệt không thấy.
            </p>
          )}
          {g?.last_error && <p className="text-xs text-rose-700">{g.last_error}</p>}
          {g && !g.configured && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 space-y-1.5">
              <p className="font-bold text-amber-900">
                Chưa cấu hình Google Cloud OAuth:
              </p>
              <p>
                Để kích hoạt nút <b>"Kết nối Google"</b>, bạn cần tạo OAuth Client ID (loại Web Application) trên <b>Google Cloud Console</b> và cấu hình 3 biến sau vào file <code>apps/api/.env</code>:
              </p>
              <ul className="list-disc pl-5 font-mono text-[11px] text-amber-900 space-y-0.5">
                <li>GOOGLE_OAUTH_CLIENT_ID=...</li>
                <li>GOOGLE_OAUTH_CLIENT_SECRET=...</li>
                <li>GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/v1/integrations/google/callback</li>
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button busy={busy === "connect"} disabled={!g?.configured || !isOwner} onClick={connect}>
              {g?.source === "workspace" ? "Kết nối lại" : "Kết nối Google"}
            </Button>
            {g?.source === "workspace" && (
              <Button
                variant="secondary"
                busy={busy === "disconnect"}
                disabled={!isOwner}
                onClick={() =>
                  run("disconnect", async () => {
                    await merchantApi.googleDisconnect(workspaceId);
                    await google.reload();
                    await onChanged();
                    return "Đã ngắt kết nối và thu hồi quyền Google.";
                  })
                }
              >
                Ngắt kết nối
              </Button>
            )}
          </div>
          {!isOwner && <p className="text-xs text-slate-500">Chỉ owner được kết nối tài khoản Google.</p>}
        </div>

        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("folder", async () => {
              const r = await merchantApi.saveDriveFolder(workspaceId, folder);
              setFolder(null);
              await onChanged();
              return r.connection.connected ? "Đã lưu thư mục Drive. Bấm “Quét Drive ngay” để lấy ảnh." : `Đã lưu thư mục. ${r.connection.reason ?? ""}`;
            });
          }}
        >
          <label htmlFor="drive-folder" className="block text-sm font-bold text-slate-900">Thư mục ảnh trên Google Drive</label>
          <input
            id="drive-folder"
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/drive/folders/…"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary" busy={busy === "folder"} disabled={!canEdit || !folder.trim() || folder.trim() === folderUrl}>
              Lưu thư mục
            </Button>
            {connection?.folder_id && (
              <a href={folderUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">
                Mở thư mục trên Drive ↗
              </a>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Thư mục công khai đọc được bằng khoá API của máy chủ; thư mục riêng tư cần “Kết nối Google” bằng tài khoản có quyền xem thư mục.
          </p>
        </form>
      </div>
      <div className="mt-3">
        <Notice notice={notice} onClose={() => setNotice(null)} />
      </div>
    </section>
  );
}
