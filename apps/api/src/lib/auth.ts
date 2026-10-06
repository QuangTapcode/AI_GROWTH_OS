import { NextRequest } from "next/server";
import { AppError } from "./errors";

export interface AuthUser {
  id: string; // UUID của user
  email: string;
  name: string;
}

/**
 * Trích xuất Bearer token từ Header và giải mã thông tin User.
 * Trong môi trường Local Dev / Pilot Tuần 1:
 * Hỗ trợ dev token định dạng: "dev_user_<uuid>_<role>"
 * để FE (Tiến/Huyền) và QA (Thanh) dễ dàng viết test và mock user.
 */
export function authenticateUser(req: NextRequest): AuthUser {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Empty authentication token");
  }

  // Token giả lập cho dev/testing
  // Ví dụ: "dev_user_00000000-0000-4000-8000-000000000001"
  if (token.startsWith("dev_user_")) {
    const parts = token.split("_");
    const userId = parts[2] || "00000000-0000-4000-8000-000000000001";
    return {
      id: userId,
      email: `${userId}@tripc.local`,
      name: "TripC Dev User",
    };
  }

  // Fallback tạm thời cho development token bất kỳ
  return {
    id: token,
    email: "user@tripc.local",
    name: "Standard User",
  };
}
