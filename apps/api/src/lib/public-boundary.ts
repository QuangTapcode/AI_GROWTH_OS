/**
 * AI Growth OS - Public/Private Security Boundary (W1-TQ-06)
 * Đảm bảo các phản hồi Public không bao giờ rò rỉ dữ liệu nội bộ:
 * - Không để lộ bản nháp (draft / needs_review / processing / archived)
 * - Không để lộ sự thật nội bộ / trích dẫn nhạy cảm (source_facts, internal citations)
 * - Không để lộ danh sách thành viên, vai trò nội bộ và email/PII
 * - Ràng buộc quyền chỉnh sửa CMS (Owner/Editor) và phê duyệt (Owner)
 */

import { ForbiddenError, NotFoundError } from "./errors";
import { UserRole } from "@/modules/workspaces/schemas";

/**
 * Danh sách các trường PII và dữ liệu nội bộ bị cấm xuất hiện trong API Public
 */
const FORBIDDEN_PUBLIC_KEYS = new Set([
  "email",
  "phone",
  "actor_id",
  "reviewed_by",
  "updated_by",
  "created_by_user_id",
  "internal_notes",
  "source_facts",
  "prompt_template",
  "raw_payload",
  "members",
  "oauth_token_encrypted",
  "safety_rules",
]);

/**
 * Lọc sạch mọi thuộc tính nội bộ hoặc nhạy cảm khỏi object trả về cho Public
 */
export function sanitizeForPublic<T extends Record<string, any>>(data: T): Partial<T> {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForPublic(item)) as unknown as Partial<T>;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      continue; // Bỏ qua các trường bị cấm
    }

    if (value && typeof value === "object" && !(value instanceof Date)) {
      sanitized[key] = sanitizeForPublic(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as Partial<T>;
}

/**
 * Đảm bảo một bài viết / nội dung phải ở trạng thái đã xuất bản (published) mới được xem công khai.
 * Nếu là bài nháp (draft, archived...) $\rightarrow$ trả về 404 Not Found (để không lộ sự tồn tại của bài nháp).
 */
export function assertPublishedOnly(
  status: string,
  resourceName = "Content"
): void {
  if (status !== "published") {
    throw new NotFoundError(
      `${resourceName} not found or is not published yet.`
    );
  }
}

/**
 * Kiểm tra quyền chỉnh sửa nội dung CMS (chỉ Owner và Editor mới được phép)
 */
export function assertCanMutateCms(role: UserRole): void {
  if (role !== "owner" && role !== "editor") {
    throw new ForbiddenError(
      `Role '${role}' is not authorized to create or edit CMS content. Required: [owner, editor]`
    );
  }
}

/**
 * Kiểm tra quyền phê duyệt nội dung / xuất bản (chỉ Owner mới có thẩm quyền)
 */
export function assertCanApproveContent(role: UserRole): void {
  if (role !== "owner") {
    throw new ForbiddenError(
      `Role '${role}' is not authorized to approve content for publishing. Required: [owner]`
    );
  }
}
