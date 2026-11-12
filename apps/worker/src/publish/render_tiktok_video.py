import io
import json
import os
import subprocess
import sys
import textwrap
import urllib.parse
import urllib.request
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

WIDTH = 720
HEIGHT = 1280
FPS = 30
DURATION_SECONDS = 5
TOTAL_FRAMES = FPS * DURATION_SECONDS


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    )
    for font_path in candidates:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def fetch_background_image(image_url: str | None) -> Image.Image | None:
    if not image_url or not isinstance(image_url, str):
        return None
    trimmed = image_url.strip()
    parsed = urllib.parse.urlparse(trimmed)
    if parsed.scheme not in ("http", "https"):
        return None
    host = (parsed.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1") or host.startswith("10.") or host.startswith("192.168."):
        return None
    try:
        req = urllib.request.Request(
            trimmed,
            headers={"User-Agent": "TripC-Growth-OS-VideoRenderer/1.0"},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = resp.read(15 * 1024 * 1024)
        img = Image.open(io.BytesIO(data)).convert("RGB")
        return img
    except Exception:
        return None


def make_gradient_background(w: int, h: int) -> Image.Image:
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(12 + 18 * (1 - t))
        g = int(28 + 56 * (1 - t))
        b = int(52 + 88 * (1 - t))
        px[0, y] = (r, g, b)
    return base.resize((w, h), Image.Resampling.BILINEAR)


def build_overlay(title: str, hook: str, cta: str) -> Image.Image:
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Top and bottom translucent gradient scrims for crisp readability
    for y in range(280):
        alpha = int(165 * (1 - y / 280))
        draw.line([(0, y), (WIDTH, y)], fill=(8, 15, 30, alpha))

    for y in range(HEIGHT - 560, HEIGHT):
        t = (y - (HEIGHT - 560)) / 560
        alpha = int(225 * min(1.0, t * 1.15))
        draw.line([(0, y), (WIDTH, y)], fill=(8, 13, 26, alpha))

    badge_font = load_font(24, bold=True)
    hook_font = load_font(40, bold=True)
    sub_font = load_font(26, bold=False)
    cta_font = load_font(24, bold=True)

    # Top brand pill
    pill_box = (44, 68, 336, 118)
    draw.rounded_rectangle(pill_box, radius=25, fill=(14, 165, 233, 220))
    draw.text((68, 79), "TRIPC VIETNAM", font=badge_font, fill=(255, 255, 255, 255))

    # Main headline / hook
    headline = (hook or title or "Vietnam Travel Guide").strip()
    wrapped_lines = textwrap.wrap(headline, width=26)[:4]
    line_height = 52
    start_y = HEIGHT - 390 - max(0, (len(wrapped_lines) - 2) * 38)

    for idx, line in enumerate(wrapped_lines):
        y = start_y + idx * line_height
        draw.text((46, y + 2), line, font=hook_font, fill=(0, 0, 0, 175))
        draw.text((44, y), line, font=hook_font, fill=(255, 255, 255, 255))

    # Secondary title / subtitle when hook differs from title
    subtitle = (title or "").strip()
    if subtitle and subtitle.lower() not in headline.lower():
        sub_lines = textwrap.wrap(subtitle, width=38)[:2]
        sub_y = start_y + len(wrapped_lines) * line_height + 16
        for idx, line in enumerate(sub_lines):
            draw.text((44, sub_y + idx * 34), line, font=sub_font, fill=(216, 230, 248, 240))

    # Bottom CTA card
    cta_text = (cta or "Follow TripC for Vietnam tips").strip()
    cta_lines = textwrap.wrap(cta_text, width=38)[:2]
    card_top = HEIGHT - 178
    draw.rounded_rectangle((44, card_top, WIDTH - 44, HEIGHT - 76), radius=18, fill=(255, 255, 255, 235))
    for idx, line in enumerate(cta_lines):
        draw.text((66, card_top + 18 + idx * 30), line, font=cta_font, fill=(15, 23, 42, 255))

    return overlay


def main() -> int:
    raw = sys.stdin.read()
    payload = json.loads(raw)
    output_path = Path(payload["output_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".tmp.mp4")

    title = str(payload.get("title") or "").strip()
    hook = str(payload.get("hook") or "").strip()
    cta = str(payload.get("cta") or "").strip()
    image_url = payload.get("image_url")

    bg_raw = fetch_background_image(image_url)
    scale_w = int(WIDTH * 1.12)
    scale_h = int(HEIGHT * 1.12)
    if bg_raw is not None:
        base_img = ImageOps.fit(bg_raw, (scale_w, scale_h), method=Image.Resampling.LANCZOS)
        base_img = base_img.filter(ImageFilter.GaussianBlur(radius=0.3))
    else:
        base_img = make_gradient_background(scale_w, scale_h)

    overlay = build_overlay(title=title, hook=hook, cta=cta)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    cmd = [
        ffmpeg_exe,
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(tmp_path),
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for frame_idx in range(TOTAL_FRAMES):
            t = frame_idx / max(1, TOTAL_FRAMES - 1)
            # Smooth zoom-in from 1.10x crop down to 1.00x crop
            crop_scale = 1.10 - 0.10 * t
            cw = int(WIDTH * crop_scale)
            ch = int(HEIGHT * crop_scale)
            left = max(0, (scale_w - cw) // 2)
            top = max(0, (scale_h - ch) // 2)
            cropped = base_img.crop((left, top, left + cw, top + ch)).resize(
                (WIDTH, HEIGHT), Image.Resampling.BILINEAR
            )
            composed = cropped.convert("RGBA")
            composed.alpha_composite(overlay)
            proc.stdin.write(composed.convert("RGB").tobytes())
        proc.stdin.close()
        stderr_out = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        code = proc.wait(timeout=60)
        if code != 0 or not tmp_path.exists() or tmp_path.stat().st_size <= 0:
            sys.stderr.write(f"ffmpeg exited with {code}: {stderr_out}\n")
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            return 1
        os.replace(tmp_path, output_path)
        print(str(output_path))
        return 0
    except Exception as exc:
        try:
            proc.kill()
        except Exception:
            pass
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        sys.stderr.write(f"render_tiktok_video failed: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

