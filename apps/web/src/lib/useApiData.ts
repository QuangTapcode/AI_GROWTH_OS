"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface ApiData<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Tải dữ liệu API khi `key` thay đổi (vd. đổi workspace). `key` null = chưa đủ điều kiện tải.
 * Request cũ bị hủy khi key đổi hoặc component unmount; dữ liệu cũ giữ nguyên trong lúc reload.
 */
export function useApiData<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
        setError(err instanceof ApiError ? err : new ApiError(0, "UNKNOWN_ERROR", (err as Error)?.message ?? "Unknown error"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
