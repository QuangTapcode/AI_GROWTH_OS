import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ApprovalView from "../src/components/ApprovalView";

describe("ApprovalView Component - Image States & Approval Gating", () => {
  it("hiển thị trạng thái image_pending và cảnh báo 'đang chờ máy GPU' khi gpu_online = false", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="image_pending"
        initialGpuOnline={false}
      />
    );

    // Badge và trạng thái pending
    expect(html).toContain('data-testid="ai-badge-pending"');
    expect(html).toContain("Đang chờ tạo ảnh");
    expect(html).toContain('data-testid="image-pending-state"');
    expect(html).toContain("Tác vụ đang nằm trong hàng đợi sinh ảnh...");

    // Cảnh báo GPU offline
    expect(html).toContain('data-testid="gpu-offline-warning"');
    expect(html).toContain("đang chờ máy GPU (hiện chưa có máy trạm online)");

    // Nút hủy tác vụ khi còn queued
    expect(html).toContain('data-testid="cancel-image-job-btn"');
    expect(html).toContain("Hủy yêu cầu sinh ảnh");

    // Khóa duyệt: nút Approve bị disabled và có badge cảnh báo
    expect(html).toContain('data-testid="approval-blocked-badge"');
    expect(html).toContain("Không thể duyệt bài khi ảnh đang chờ tạo");
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("hiển thị image_pending khi gpu_online = true thì KHÔNG có cảnh báo GPU offline", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="image_pending"
        initialGpuOnline={true}
      />
    );

    expect(html).toContain('data-testid="image-pending-state"');
    expect(html).not.toContain('data-testid="gpu-offline-warning"');
    expect(html).toContain('data-testid="cancel-image-job-btn"');
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("hiển thị trạng thái running: máy trạm GPU đang thực hiện khuếch tán hình ảnh, nút hủy bị ẩn", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="running"
      />
    );

    expect(html).toContain('data-testid="ai-badge-running"');
    expect(html).toContain("Đang xử lý GPU");
    expect(html).toContain('data-testid="image-running-state"');
    expect(html).toContain("Máy trạm GPU đang thực hiện khuếch tán hình ảnh...");

    // Khi đã running thì KHÔNG hiển thị nút hủy tác vụ nữa
    expect(html).not.toContain('data-testid="cancel-image-job-btn"');

    // Khóa duyệt bài
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("hiển thị trạng thái completed: có ảnh render, huy hiệu '[Ảnh tạo bởi AI]' và nút tạo lại ảnh", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="completed"
        userRole="editor"
      />
    );

    // Huy hiệu AI
    expect(html).toContain('data-testid="ai-badge-completed"');
    expect(html).toContain("[Ảnh tạo bởi AI]");

    // Container ảnh và thông số metadata
    expect(html).toContain('data-testid="image-completed-container"');
    expect(html).toContain("Juggernaut XL v9");
    expect(html).toContain("OCR Guardrail");
    expect(html).toContain("Đạt (0 chữ/số)");

    // Nút tạo lại ảnh
    expect(html).toContain('data-testid="regenerate-image-btn"');
    expect(html).toContain("Tạo lại ảnh (Đổi Seed mới)");

    // Đã hoàn thành nên nút Approve KHÔNG bị disabled do ảnh
    expect(html).not.toContain('data-testid="approval-blocked-badge"');
    const approveBtnMatches = html.match(/<button[^>]*data-testid="approve-btn"[^>]*>/);
    expect(approveBtnMatches).toBeTruthy();
    expect(approveBtnMatches![0]).not.toContain('disabled=""');
  });

  it("hiển thị trạng thái needs_assets: nhắc dùng ảnh thật doanh nghiệp và cung cấp nút chọn ảnh", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="needs_assets"
      />
    );

    expect(html).toContain('data-testid="ai-badge-needs-assets"');
    expect(html).toContain("Cần ảnh thật");
    expect(html).toContain('data-testid="image-needs-assets-state"');
    expect(html).toContain("Yêu cầu sử dụng ảnh chụp thực tế từ kho tài nguyên");
    expect(html).toContain('data-testid="use-real-asset-btn"');
    expect(html).toContain("Chọn ảnh thật từ kho");
    expect(html).toContain('data-testid="regenerate-image-btn"');

    // Nút Approve bị khóa khi thiếu ảnh hợp lệ
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("hiển thị trạng thái failed: hiển thị thông báo lỗi và nút tạo lại ảnh", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="failed"
      />
    );

    expect(html).toContain('data-testid="ai-badge-failed"');
    expect(html).toContain("Lỗi tạo ảnh");
    expect(html).toContain('data-testid="image-failed-state"');
    expect(html).toContain("Quá trình sinh ảnh thất bại");
    expect(html).toContain('data-testid="regenerate-image-btn"');

    // Nút Approve bị khóa khi ảnh lỗi
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("cho phép duyệt khi bài KHÔNG bắt buộc có ảnh (requiresImage = false) dù ảnh đang pending", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_text_only"
        requiresImage={false}
        initialImageStatus="image_pending"
        userRole="editor"
      />
    );

    // Không bị chặn bởi approval-blocked-badge
    expect(html).not.toContain('data-testid="approval-blocked-badge"');
    const approveBtnMatches = html.match(/<button[^>]*data-testid="approve-btn"[^>]*>/);
    expect(approveBtnMatches).toBeTruthy();
    expect(approveBtnMatches![0]).not.toContain('disabled=""');
  });

  it("chặn quyền phê duyệt nếu userRole là 'viewer' dù ảnh đã completed", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="completed"
        userRole="viewer"
      />
    );

    expect(html).toContain("viewer");
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("hiển thị nút đăng bài (Publish) và chặn đăng khi ảnh đang pending", () => {
    const onPublishMock = vi.fn();
    const htmlPending = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="image_pending"
        onPublishClick={onPublishMock}
      />
    );

    // Nút đăng bài bị disabled khi ảnh pending
    expect(htmlPending).toContain('data-testid="publish-btn"');
    expect(htmlPending).toMatch(/<button[^>]*data-testid="publish-btn"[^>]*disabled=""/);
  });

  it("hiển thị trạng thái cancelled: có thông báo đã hủy và nút 'Tạo ảnh mới'", () => {
    const html = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_123"
        requiresImage={true}
        initialImageStatus="cancelled"
      />
    );

    expect(html).toContain('data-testid="ai-badge-cancelled"');
    expect(html).toContain("Đã hủy");
    expect(html).toContain('data-testid="image-cancelled-state"');
    expect(html).toContain("Tác vụ sinh ảnh đã bị hủy");
    expect(html).toContain('data-testid="regenerate-image-btn"');
    expect(html).toContain("Tạo ảnh mới");

    // Khóa duyệt khi chưa có ảnh hợp lệ
    expect(html).toMatch(/<button[^>]*data-testid="approve-btn"[^>]*disabled=""/);
  });

  it("chuyển kênh hiển thị đúng tỷ lệ và metadata ảnh (Facebook 1:1 vs TikTok 9:16)", () => {
    const htmlFb = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_fb"
        requiresImage={true}
        initialImageStatus="completed"
      />
    );

    expect(htmlFb).toContain("1024x1024 (1:1)");
    expect(htmlFb).toContain("aspect-square");

    // Dữ liệu tùy chỉnh TikTok
    const customData = {
      facebook: {
        channel: "facebook" as const,
        title: "FB Post",
        hook: "Hook FB",
        body: ["Body FB"],
        cta: "CTA FB",
        hashtags: ["#FB"],
        full_caption: "Full Caption FB",
        sentences: [],
        ai_image: {
          url: "http://example.com/fb.webp",
          prompt: "FB Image",
          negative_prompt: "no text",
          model: "Juggernaut XL v9",
          aspect_ratio: "1:1" as const,
          dimensions: "1024x1024",
          ocr_checked: true,
          ocr_text_found: [],
          safety_passed: true,
          sha256_hash: "fb".repeat(32),
        },
      },
      tiktok: {
        channel: "tiktok" as const,
        title: "TikTok Video",
        hook: "Hook TT",
        body: ["Body TT"],
        cta: "CTA TT",
        hashtags: ["#TT"],
        full_caption: "Full Caption TT",
        sentences: [],
        ai_image: {
          url: "http://example.com/tt.webp",
          prompt: "TT Image 9:16",
          negative_prompt: "no text",
          model: "Juggernaut XL v9",
          aspect_ratio: "9:16" as const,
          dimensions: "768x1344",
          ocr_checked: true,
          ocr_text_found: [],
          safety_passed: true,
          sha256_hash: "tt".repeat(32),
        },
      },
    };

    const htmlCustom = renderToStaticMarkup(
      <ApprovalView
        workspaceId="ws_test"
        postId="post_custom"
        initialData={customData}
        requiresImage={true}
        initialImageStatus="completed"
      />
    );

    expect(htmlCustom).toContain("1024x1024");
    expect(htmlCustom).toContain('data-testid="channel-facebook-tab"');
    expect(htmlCustom).toContain('data-testid="channel-tiktok-tab"');
  });
});
