import { describe, it, expect } from "vitest";
import { reviewApprovalSchema, createApprovalSchema } from "../../src/modules/approvals/schemas";
import { assertPublishedOnly, sanitizeForPublic } from "../../src/lib/public-boundary";
import { NotFoundError } from "../../src/lib/errors";

describe("Approval OCC & Public Boundary (TQ-04)", () => {
  describe("1. Validation OCC Review Schema", () => {
    it("chấp nhận payload hợp lệ với decision, expected_version và 64-char SHA-256 hash", () => {
      const validPayload = {
        decision: "approve",
        expected_version: 2,
        expected_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
        review_note: "Content verified against ground truth",
      };
      const result = reviewApprovalSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("từ chối nếu expected_version < 1", () => {
      const invalidPayload = {
        decision: "approve",
        expected_version: 0,
        expected_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      };
      const result = reviewApprovalSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("expected_version"))).toBe(true);
      }
    });

    it("từ chối nếu expected_hash không phải 64 ký tự SHA-256 hex", () => {
      const invalidPayload = {
        decision: "approve",
        expected_version: 1,
        expected_hash: "short-hash-123",
      };
      const result = reviewApprovalSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("expected_hash"))).toBe(true);
      }
    });

    it("từ chối decision không nằm trong allowlist [approve, reject, revoke]", () => {
      const invalidPayload = {
        decision: "publish_immediately",
        expected_version: 1,
        expected_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      };
      const result = reviewApprovalSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Public Boundary: assertPublishedOnly", () => {
    it("cho phép xem nội dung khi status là 'published'", () => {
      expect(() => assertPublishedOnly("published")).not.toThrow();
    });

    it("chặn và ném lỗi NotFoundError (404) khi status là 'draft'", () => {
      expect(() => assertPublishedOnly("draft")).toThrow(NotFoundError);
    });

    it("chặn và ném lỗi NotFoundError (404) khi status là 'needs_review' hoặc 'archived'", () => {
      expect(() => assertPublishedOnly("needs_review")).toThrow(NotFoundError);
      expect(() => assertPublishedOnly("archived")).toThrow(NotFoundError);
    });
  });

  describe("3. Public Boundary: sanitizeForPublic strip internal keys", () => {
    it("lọc sạch triệt để mọi trường dữ liệu nội bộ và PII", () => {
      const internalData = {
        title: "Living in Da Nang 2026",
        slug: "living-in-da-nang-2026",
        body: "Comprehensive expat guide...",
        published_at: "2026-10-15T00:00:00Z",
        // Internal / sensitive fields:
        email: "author@tripc.vn",
        actor_id: "11111111-1111-4000-8000-000000000001",
        reviewed_by: "22222222-2222-4000-8000-000000000002",
        evidence: [{ quote: "internal quote", source_id: "src-1" }],
        internal_notes: "Drafted by Content Agent",
        preview_token: "secret-preview-token-xyz",
        target_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
        task_id: "33333333-3333-4000-8000-000000000003",
      };

      const sanitized = sanitizeForPublic(internalData);

      // Cho phép
      expect(sanitized.title).toBe("Living in Da Nang 2026");
      expect(sanitized.slug).toBe("living-in-da-nang-2026");
      expect(sanitized.body).toBe("Comprehensive expat guide...");
      expect(sanitized.published_at).toBe("2026-10-15T00:00:00Z");

      // Bị loại bỏ hoàn toàn
      expect(sanitized.email).toBeUndefined();
      expect(sanitized.actor_id).toBeUndefined();
      expect(sanitized.reviewed_by).toBeUndefined();
      expect(sanitized.evidence).toBeUndefined();
      expect(sanitized.internal_notes).toBeUndefined();
      expect(sanitized.preview_token).toBeUndefined();
      expect(sanitized.target_hash).toBeUndefined();
      expect(sanitized.task_id).toBeUndefined();
    });
  });
});
