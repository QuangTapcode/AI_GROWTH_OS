"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface GpuWorkerItem {
  id: string;
  name: string;
  status: "online" | "busy" | "offline" | "disabled";
  last_seen_at: string | null;
  vram_free_mb: number | null;
  worker_version: string | null;
  engine_version: string | null;
  model_key: string | null;
  active_job_id: string | null;
  created_at: string;
}

interface RecentJobItem {
  id: string;
  root_job_id: string;
  attempt: number;
  delivery_count: number;
  status: string;
  prompt: string;
  aspect_ratio: string;
  model_name: string;
  seed: number | null;
  error_code: string | null;
  error_message: string | null;
  claimed_by: string | null;
  result_sha256: string | null;
  created_at: string;
  completed_at: string | null;
}

interface AdminGpuData {
  gpu_online: boolean;
  workers: GpuWorkerItem[];
  recent_jobs: RecentJobItem[];
}

export default function GpuWorkersAdminPage() {
  const [data, setData] = useState<AdminGpuData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchAdminData = useCallback(async () => {
    try {
      setError(null);
      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000")
        .replace(/\/v1\/?$/, "")
        .replace(/\/$/, "");

      const res = await fetch(`${apiBase}/api/v1/gpu-worker/admin`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Không thể tải thông tin GPU workers.`);
      }

      const json: AdminGpuData = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err?.message || "Lỗi nạp dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchAdminData, 10000);
    return () => clearInterval(interval);
  }, [fetchAdminData, autoRefresh]);

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return "Chưa từng";
    const diff = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
    if (diff < 60) return `${diff}s trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m trước`;
    return `${Math.floor(diff / 3600)}h trước`;
  };

  return (
    <div className="text-slate-800 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link href="/office" className="hover:text-slate-800">3D Office HQ</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">Phòng Máy Chủ GPU Workers</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Tự động làm mới (10s)</span>
            </label>
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>🔄</span>
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                GPU Worker Cluster (Reverse-Connect)
              </span>
              <span className="text-xs text-slate-400">
                Cập nhật lúc: {lastRefreshed.toLocaleTimeString()}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
              Bảng Điều Khiển Quản Trị Máy Trạm GPU &amp; Image Jobs
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Giám sát tình trạng kết nối máy trạm GPU, VRAM khả dụng, chu kỳ heartbeat và 20 tác vụ sinh ảnh gần nhất.
            </p>
          </div>

          {/* Cluster Status Pill */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400 font-semibold uppercase">Cụm Máy Trạm GPU</div>
              <div className="text-sm font-bold text-slate-800">
                {data?.gpu_online ? (
                  <span className="text-emerald-600 flex items-center gap-1.5 justify-end">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    ONLINE &amp; SẴN SÀNG
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1.5 justify-end">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    OFFLINE (HÀNG ĐỢI CHỜ)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={fetchAdminData} className="underline font-bold cursor-pointer">
              Thử lại
            </button>
          </div>
        )}

        {/* ── SECTION 1: GPU WORKERS LIST ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Danh Sách Máy Trạm (GPU Workers)</h2>
              <p className="text-xs text-slate-500">
                Các máy trạm local chạy GPU worker kết nối ngược ra Cloud qua HTTP Long-poll.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              {data?.workers.length || 0} máy trạm đã đăng ký
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Tên Máy Trạm / ID</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Heartbeat Gần Nhất</th>
                  <th className="py-3 px-4">VRAM Khả Dụng</th>
                  <th className="py-3 px-4">Tác Vụ Hiện Tại</th>
                  <th className="py-3 px-4">Phiên Bản</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {data?.workers && data.workers.length > 0 ? (
                  data.workers.map((worker) => {
                    const isOnline = worker.status === "online";
                    const isBusy = worker.status === "busy";
                    return (
                      <tr key={worker.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-sans font-bold text-slate-900">
                          <div>{worker.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 font-normal">
                            {worker.id}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-sans">
                          {isOnline ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              ONLINE
                            </span>
                          ) : isBusy ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              BUSY (ĐANG SINH)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              OFFLINE
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-sans text-slate-600">
                          {formatRelativeTime(worker.last_seen_at)}
                        </td>
                        <td className="py-3.5 px-4">
                          {worker.vram_free_mb !== null ? (
                            <span className="font-bold text-slate-800">
                              {(worker.vram_free_mb / 1024).toFixed(1)} GB ({worker.vram_free_mb} MB)
                            </span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {worker.active_job_id ? (
                            <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {worker.active_job_id.slice(0, 8)}...
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans italic">Rảnh (Idle)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-sans text-slate-500 text-[11px]">
                          <div>Worker: {worker.worker_version || "1.0.0"}</div>
                          <div>Engine: {worker.engine_version || "1.0.0"}</div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                      {loading ? "Đang tải dữ liệu máy trạm..." : "Chưa có máy trạm GPU nào được kết nối."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 2: 20 RECENT IMAGE JOBS ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">20 Tác Vụ Sinh Ảnh Gần Nhất (Recent Image Jobs)</h2>
              <p className="text-xs text-slate-500">
                Bao gồm mã lỗi kỹ thuật (OOM, MODEL_NOT_SUPPORTED) và guardrail (GUARDRAIL_PRICE_DETECTED).
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              {data?.recent_jobs.length || 0} jobs gần nhất
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Mã Tác Vụ (Job ID)</th>
                  <th className="py-3 px-4">Lượt (Attempt)</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Mã Lỗi (Error Code)</th>
                  <th className="py-3 px-4">Prompt</th>
                  <th className="py-3 px-4">Thời Gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {data?.recent_jobs && data.recent_jobs.length > 0 ? (
                  data.recent_jobs.map((job) => {
                    const isSuccess = job.status === "completed";
                    const isFailed = job.status === "failed";
                    const isNeedsAssets = job.status === "needs_assets";
                    const isRunning = job.status === "running" || job.status === "claimed";
                    const isQueued = job.status === "queued";

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div>{job.id.slice(0, 8)}...</div>
                          {job.root_job_id !== job.id && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              Root: {job.root_job_id.slice(0, 8)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          #{job.attempt}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          {isSuccess && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              ✅ Completed
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                              ❌ Failed
                            </span>
                          )}
                          {isNeedsAssets && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                              ⚠️ Needs Assets
                            </span>
                          )}
                          {isRunning && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                              ⚡ Running
                            </span>
                          )}
                          {isQueued && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                              ⏳ Queued
                            </span>
                          )}
                          {job.status === "cancelled" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">
                              🚫 Cancelled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {job.error_code ? (
                            <div title={job.error_message || ""}>
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                {job.error_code}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-sans max-w-xs">
                          <p className="line-clamp-2 text-slate-700 text-[11px]" title={job.prompt}>
                            {job.prompt || "N/A"}
                          </p>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Tỉ lệ: {job.aspect_ratio} {job.seed ? `· Seed: ${job.seed}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-500 text-[11px]">
                          <div>{new Date(job.created_at).toLocaleTimeString()}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(job.created_at).toLocaleDateString()}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                      {loading ? "Đang tải tác vụ gần nhất..." : "Chưa có tác vụ sinh ảnh nào."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

