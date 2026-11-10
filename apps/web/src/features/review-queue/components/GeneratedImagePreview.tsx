/** An AI illustration attached to a draft: whoever approves the draft approves the image, so they must see it. */
export default function GeneratedImagePreview({ image }: { image: Record<string, unknown> }) {
  const url = typeof image.url === "string" && image.url.startsWith("https://") ? image.url : "";
  if (!url) return null;
  const alt = typeof image.alt_text === "string" ? image.alt_text : "Ảnh minh hoạ bài đăng";
  const isVerifiedStockAsset = image.synthetic === false;
  return (
    <figure className="mt-3 space-y-2" data-testid="generated-image">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={alt} className="max-h-72 rounded-lg border border-slate-200" />
      </a>
      <figcaption
        className={`rounded-lg p-3 text-xs ${
          isVerifiedStockAsset ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
        }`}
      >
        {isVerifiedStockAsset
          ? "Ảnh minh họa đã phê duyệt & đồng bộ giữa Lịch Cộng đồng, Distribution và Facebook Group."
          : "Ảnh do AI tạo. Chỉ được đăng khi bạn duyệt bài này và sẽ có nhãn ảnh AI. Máy chỉ kiểm tra chữ và số trong ảnh, nên hãy tự xem kỹ nội dung, logo và khuôn mặt."}
      </figcaption>
    </figure>
  );
}
