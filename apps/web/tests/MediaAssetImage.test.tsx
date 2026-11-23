import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MediaAssetImage, { MediaAssetData } from "../src/components/ui/MediaAssetImage";

describe("MediaAssetImage Component Test Suite", () => {
  const mockAiAsset: MediaAssetData = {
    id: "ast_ai_001",
    url: "http://localhost:3000/uploads/generated/test_ai_image.webp",
    source_type: "ai_generated",
    is_ai_generated: true,
    alt_text: "[Ảnh minh họa AI] Bãi biển Mỹ Khê Đà Nẵng",
    prompt: "A beautiful coastal scene in Da Nang at sunrise",
    model_name: "Juggernaut XL v9",
    seed: 123456,
    width: 1024,
    height: 1024,
    content_hash: "a".repeat(64),
  };

  const mockRealAsset: MediaAssetData = {
    id: "ast_real_001",
    url: "https://assets.tripc.vn/rooms/studio_living_room_real.jpg",
    source_type: "real_asset",
    is_ai_generated: false,
    alt_text: "Phòng khách căn hộ Studio TripC Đà Nẵng chụp thực tế",
    width: 1920,
    height: 1080,
  };

  it("gắn huy hiệu '[Ảnh tạo bởi AI]' cho ảnh do AI sinh (source_type = 'ai_generated')", () => {
    const html = renderToStaticMarkup(
      <MediaAssetImage asset={mockAiAsset} />
    );

    expect(html).toContain("[Ảnh tạo bởi AI]");
    expect(html).toContain('data-testid="ai-image-badge"');
    expect(html).toContain("✨");
    expect(html).toContain('src="http://localhost:3000/uploads/generated/test_ai_image.webp"');
    expect(html).toContain('alt="[Ảnh minh họa AI] Bãi biển Mỹ Khê Đà Nẵng"');
  });

  it("KHÔNG hiển thị huy hiệu '[Ảnh tạo bởi AI]' đối với ảnh chụp thực tế (source_type = 'real_asset')", () => {
    const html = renderToStaticMarkup(
      <MediaAssetImage asset={mockRealAsset} />
    );

    expect(html).not.toContain("[Ảnh tạo bởi AI]");
    expect(html).not.toContain('data-testid="ai-image-badge"');
    expect(html).toContain('src="https://assets.tripc.vn/rooms/studio_living_room_real.jpg"');
    expect(html).toContain('alt="Phòng khách căn hộ Studio TripC Đà Nẵng chụp thực tế"');
  });

  it("hiển thị trạng thái loading skeleton khi ảnh đang được tải", () => {
    const html = renderToStaticMarkup(
      <MediaAssetImage asset={mockAiAsset} />
    );

    expect(html).toContain('data-testid="media-asset-loading"');
    expect(html).toContain("Đang tải ảnh...");
  });

  it("hiển thị trạng thái lỗi và alt text khi không có URL hoặc URL rỗng", () => {
    const brokenAsset: MediaAssetData = {
      id: "ast_broken_001",
      url: "",
      source_type: "ai_generated",
      is_ai_generated: true,
      alt_text: "Ảnh bị lỗi đường dẫn",
    };

    const html = renderToStaticMarkup(
      <MediaAssetImage asset={brokenAsset} />
    );

    expect(html).toContain('data-testid="media-asset-error"');
    expect(html).toContain("Không thể tải hình ảnh");
    expect(html).toContain("Ảnh bị lỗi đường dẫn");
    // Dù lỗi ảnh, huy hiệu AI vẫn hiển thị để reviewer biết vị trí này dành cho ảnh AI
    expect(html).toContain("[Ảnh tạo bởi AI]");
  });

  it("hỗ trợ tỷ lệ khung hình 1:1, 9:16 và hiển thị caption thông số AI khi showCaption = true", () => {
    const html1x1 = renderToStaticMarkup(
      <MediaAssetImage asset={mockAiAsset} aspectRatio="1:1" showCaption={true} />
    );
    expect(html1x1).toContain("aspect-square");
    expect(html1x1).toContain('data-testid="media-asset-caption"');
    expect(html1x1).toContain("Juggernaut XL v9");
    expect(html1x1).toContain("123456");

    const html9x16 = renderToStaticMarkup(
      <MediaAssetImage asset={mockAiAsset} aspectRatio="9:16" />
    );
    expect(html9x16).toContain("aspect-[9/16]");
  });

  it("ưu tiên alt text theo thứ tự: asset.alt_text -> prop alt -> fallback mặc định", () => {
    // 1. Dùng asset.alt_text
    const html1 = renderToStaticMarkup(
      <MediaAssetImage asset={{ url: "http://example.com/1.png", alt_text: "Alt từ asset" }} />
    );
    expect(html1).toContain('alt="Alt từ asset"');

    // 2. Dùng prop alt khi asset không có alt_text
    const html2 = renderToStaticMarkup(
      <MediaAssetImage asset={{ url: "http://example.com/2.png" }} alt="Alt từ prop" />
    );
    expect(html2).toContain('alt="Alt từ prop"');

    // 3. Fallback mặc định cho ảnh AI
    const html3 = renderToStaticMarkup(
      <MediaAssetImage asset={{ url: "http://example.com/3.png", is_ai_generated: true }} />
    );
    expect(html3).toContain('alt="Ảnh minh họa tạo bởi AI"');
  });
});

