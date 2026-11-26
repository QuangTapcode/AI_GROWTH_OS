import MediaAssetImage from "../../../components/ui/MediaAssetImage";

/** An AI illustration attached to a draft: whoever approves the draft approves the image, so they must see it. */
export default function GeneratedImagePreview({ image }: { image: Record<string, unknown> }) {
  const rawUrl = typeof image.url === "string" ? image.url.trim() : "";
  const isValidUrl =
    rawUrl.startsWith("https://") ||
    rawUrl.startsWith("http://") ||
    rawUrl.startsWith("/uploads/") ||
    rawUrl.startsWith("/");

  if (!isValidUrl) return null;

  const alt = typeof image.alt_text === "string" ? image.alt_text : "Ảnh minh hoạ bài đăng";
  const isVerifiedStockAsset = image.synthetic === false || image.source_type === "real_asset";

  // Build MediaAssetData structure
  const assetData = {
    ...image,
    url: rawUrl,
    alt_text: alt,
    is_ai_generated: !isVerifiedStockAsset,
    source_type: isVerifiedStockAsset ? "real_asset" : "ai_generated",
  };

  return (
    <figure className="mt-3 space-y-2" data-testid="generated-image">
      <div className="max-w-md">
        <MediaAssetImage
          asset={assetData}
          src={rawUrl}
          alt={alt}
          containerClassName="max-h-80 shadow-xs"
        />
      </div>
      <figcaption
        className={`rounded-lg p-3 text-xs ${
          isVerifiedStockAsset ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
        }`}
      >
        {isVerifiedStockAsset
          ? "Ảnh minh họa thực tế đã phê duyệt & đồng bộ giữa Lịch Cộng đồng, Distribution và Facebook Group."
          : "Ảnh do AI tạo. Chỉ được đăng khi bạn duyệt bài này và có gắn huy hiệu [Ảnh tạo bởi AI]. Máy đã qua OCR guardrail kiểm tra chữ và số trong ảnh, hãy tự xem kỹ nội dung, logo và bối cảnh."}
      </figcaption>
    </figure>
  );
}
