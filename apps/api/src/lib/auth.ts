import { NextRequest } from "next/server";
import { AppError } from "./errors";

export interface AuthUser {
  id: string; // UUID của user
  email: string;
  name: string;
}

export type AuthenticatedUser = AuthUser;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trích xuất Bearer token từ Header và giải mã thông tin User.
 * Trong môi trường Local Dev / Pilot:
 * Hỗ trợ dev token định dạng: "dev_user_<uuid>_<role>"
 * hoặc các token dev tiện ích: "dev_owner", "dev_editor", "dev_viewer", hoặc UUID trực tiếp.
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

  const isProduction = process.env.NODE_ENV === "production";

  // CHẶN ĐỨNG DEV TOKENS TRÊN PRODUCTION:
  if (isProduction && process.env.ALLOW_INSECURE_DEV_AUTH !== "true") {
    if (
      token.startsWith("dev_user_") ||
      token === "owner" ||
      token === "dev_owner" ||
      token === "editor" ||
      token === "dev_editor" ||
      token === "viewer" ||
      token === "dev_viewer"
    ) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Dev tokens are strictly forbidden in production environment"
      );
    }

    if (UUID_REGEX.test(token)) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Unsigned raw UUID tokens are forbidden in production. Signed JWT/OAuth token required"
      );
    }

    throw new AppError(401, "UNAUTHORIZED", "Invalid production authentication token format");
  }

  // Token giả lập cho dev/testing định dạng: "dev_user_<uuid>_<role>" hoặc "dev_user_<uuid>"
  if (token.startsWith("dev_user_")) {
    const parts = token.split("_");
    const potentialId = parts[2] || "";
    const userId = UUID_REGEX.test(potentialId)
      ? potentialId
      : "00000000-0000-4000-8000-000000000001";
    return {
      id: userId,
      email: `${userId}@tripc.local`,
      name: "TripC Dev User",
    };
  }

  // Nếu token chính là một UUID hợp lệ
  if (UUID_REGEX.test(token)) {
    return {
      id: token,
      email: `${token}@tripc.local`,
      name: "Standard User",
    };
  }

  // Fallback dev tokens tiện ích cho dev / QA
  if (token === "owner" || token === "dev_owner") {
    return {
      id: "11111111-1111-4000-8000-000000000001",
      email: "owner@tripc.local",
      name: "TripC Owner",
    };
  }
  if (token === "editor" || token === "dev_editor") {
    return {
      id: "22222222-2222-4000-8000-000000000002",
      email: "editor@tripc.local",
      name: "TripC Editor",
    };
  }
  if (token === "viewer" || token === "dev_viewer") {
    return {
      id: "33333333-3333-4000-8000-000000000003",
      email: "viewer@tripc.local",
      name: "TripC Viewer",
    };
  }

  // Token không đúng định dạng UUID
  throw new AppError(401, "UNAUTHORIZED", "Invalid token format: expected valid user UUID or dev token");
}
