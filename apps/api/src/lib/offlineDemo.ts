/**
 * Chế độ demo khi KHÔNG có Postgres (chỉ dùng để trình diễn giao diện trên máy cá nhân).
 *
 * Quy tắc:
 * - Chỉ bật khi đặt rõ AGOS_OFFLINE_DEMO=1 và không chạy production.
 * - Chỉ áp dụng cho lỗi mất kết nối DB (ECONNREFUSED, timeout, DB chưa tạo...), không bao giờ
 *   nuốt lỗi nghiệp vụ (403/404/409/422) hay lỗi SQL thật.
 * - Chỉ dùng cho thao tác ĐỌC. Thao tác GHI (duyệt bài, tạo task, đặt bàn, nạp ví...) không được
 *   giả thành công: nếu DB lỗi thì phải báo lỗi để người dùng biết chưa có gì được lưu.
 */
const DB_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "3D000", // database does not exist
  "28P01", // invalid_password (DB local chưa cấu hình)
  "08001",
  "08006",
]);

export function offlineDemoEnabled(): boolean {
  return process.env.AGOS_OFFLINE_DEMO === "1" && process.env.NODE_ENV !== "production";
}

export function isDbUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; errors?: unknown };
  if (typeof e.code === "string" && DB_UNAVAILABLE_CODES.has(e.code)) return true;
  // pg-pool gom nhiều lỗi kết nối vào AggregateError
  if (Array.isArray(e.errors) && e.errors.some((inner) => isDbUnavailableError(inner))) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /connection terminated|timeout exceeded when trying to connect|connect ECONNREFUSED/i.test(message);
}

/** true khi được phép trả dữ liệu demo thay vì ném lỗi `err`. */
export function canServeOfflineDemo(err: unknown): boolean {
  return offlineDemoEnabled() && isDbUnavailableError(err);
}

/** Chạy `read`; nếu DB không khả dụng VÀ đang bật demo offline thì trả `demo()`, ngược lại ném lỗi gốc. */
export async function readWithOfflineDemo<T>(read: () => Promise<T>, demo: () => T): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (canServeOfflineDemo(err)) return demo();
    throw err;
  }
}
