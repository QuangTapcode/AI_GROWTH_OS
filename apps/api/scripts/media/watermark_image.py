"""Gắn watermark logo/ tên quán lên ảnh món ăn trước khi đăng (Pillow).

Đầu vào JSON qua stdin:
  {"input": "path/in.jpg", "output": "path/out.jpg", "logo": "path/logo.png" | null,
   "text": "Tên quán", "position": "bottom_right", "max_side": 1600}

- Ảnh được xoay đúng chiều EXIF (ảnh chụp điện thoại), thu nhỏ cạnh dài tối đa max_side.
- Logo chiếm ~18% cạnh ngắn, mờ 85%, cách mép 3%; không có logo thì dùng chữ tên quán trên nền mờ.
- Xuất JPEG chất lượng 88 (Facebook/Instagram/Google đều nhận).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps


def load_font(size: int) -> ImageFont.ImageFont:
    for path in (
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def place(base_w: int, base_h: int, w: int, h: int, margin: int, position: str) -> tuple[int, int]:
    x = base_w - w - margin if "right" in position else margin
    y = base_h - h - margin if "bottom" in position else margin
    return x, y


def main() -> int:
    cfg = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    image = ImageOps.exif_transpose(Image.open(cfg["input"])).convert("RGB")
    max_side = int(cfg.get("max_side") or 1600)
    image.thumbnail((max_side, max_side))
    w, h = image.size
    short = min(w, h)
    margin = max(12, int(short * 0.03))
    position = cfg.get("position") or "bottom_right"
    canvas = image.convert("RGBA")

    logo_path = cfg.get("logo")
    if logo_path and os.path.exists(logo_path):
        logo = ImageOps.exif_transpose(Image.open(logo_path)).convert("RGBA")
        target = max(48, int(short * 0.18))
        logo.thumbnail((target, target))
        alpha = logo.getchannel("A").point(lambda a: int(a * 0.85))
        logo.putalpha(alpha)
        canvas.alpha_composite(logo, place(w, h, logo.width, logo.height, margin, position))
    else:
        text = (cfg.get("text") or "").strip()[:60]
        if text:
            font = load_font(max(16, int(short * 0.045)))
            overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
            tw, th = right - left, bottom - top
            pad = max(6, int(th * 0.45))
            x, y = place(w, h, tw + pad * 2, th + pad * 2, margin, position)
            draw.rounded_rectangle((x, y, x + tw + pad * 2, y + th + pad * 2), radius=pad, fill=(0, 0, 0, 110))
            draw.text((x + pad - left, y + pad - top), text, font=font, fill=(255, 255, 255, 235))
            canvas = Image.alpha_composite(canvas, overlay)

    canvas.convert("RGB").save(cfg["output"], "JPEG", quality=88, optimize=True)
    print(json.dumps({"ok": True, "width": w, "height": h}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - trả lỗi dạng JSON cho tiến trình Node
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
