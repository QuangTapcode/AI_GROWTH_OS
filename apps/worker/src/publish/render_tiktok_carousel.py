"""Dựng video carousel TikTok 720x1280 từ 3–5 ảnh món thật + nhạc nền (Agent 4).

Đầu vào JSON qua stdin:
  {"image_urls": [...3-5 url], "output_path": "...mp4", "title": "Hook ngắn", "brand": "Tên quán",
   "music_path": "nhac.mp3" | null, "seconds_per_image": 3.0}

- Mỗi ảnh: nền mờ lấp đầy khung dọc + ảnh chính giữ nguyên tỉ lệ, zoom chậm (Ken Burns).
- Chuyển cảnh mờ dần 0.5s giữa các ảnh; tiêu đề ở ảnh đầu, tên quán ở ảnh cuối.
- Âm thanh: nhạc trong music_path (cắt đúng độ dài, fade out 1.5s); không có nhạc thì dùng track im lặng
  (TikTok yêu cầu video có luồng âm thanh hợp lệ ở một số thiết bị).
- ffmpeg: imageio_ffmpeg nếu có, ngược lại FFMPEG_BIN hoặc "ffmpeg" trong PATH.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import textwrap
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

WIDTH, HEIGHT, FPS = 720, 1280, 30
FADE_SECONDS = 0.5


def ffmpeg_binary() -> str:
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    explicit = os.environ.get("FFMPEG_BIN", "").strip()
    if explicit:
        return explicit
    found = shutil.which("ffmpeg")
    if not found:
        raise RuntimeError("ffmpeg not found (install ffmpeg or pip install imageio-ffmpeg)")
    return found


def load_font(size: int, bold: bool = True) -> ImageFont.ImageFont:
    names = (
        [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if bold
        else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    )
    for path in names:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def fetch_image(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "AIGrowthOS-Renderer/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - URL do API ký và kiểm soát
        data = resp.read(12 * 1024 * 1024)
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")


def compose_slide(photo: Image.Image, zoom_extra: float = 0.08) -> Image.Image:
    """Ảnh nền mờ lấp khung + ảnh chính lớn hơn khung một chút để có chỗ zoom."""
    bg = ImageOps.fit(photo, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (0, 0, 0)), 0.25)
    target_w = int(WIDTH * (1 + zoom_extra))
    fg = photo.copy()
    fg.thumbnail((target_w, int(HEIGHT * 0.9 * (1 + zoom_extra))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (int(WIDTH * (1 + zoom_extra)), int(HEIGHT * (1 + zoom_extra))))
    canvas.paste(bg.resize(canvas.size), (0, 0))
    canvas.paste(fg, ((canvas.width - fg.width) // 2, (canvas.height - fg.height) // 2))
    return canvas


def text_overlay(lines: list[str], position: str, size: int) -> Image.Image:
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    if not lines:
        return overlay
    draw = ImageDraw.Draw(overlay)
    font = load_font(size)
    line_h = int(size * 1.3)
    block_h = line_h * len(lines) + 40
    top = 120 if position == "top" else HEIGHT - block_h - 160
    draw.rounded_rectangle((36, top, WIDTH - 36, top + block_h), radius=24, fill=(0, 0, 0, 140))
    for i, line in enumerate(lines):
        left, _, right, _ = draw.textbbox((0, 0), line, font=font)
        draw.text(((WIDTH - (right - left)) // 2, top + 20 + i * line_h), line, font=font, fill=(255, 255, 255, 255))
    return overlay


def frame_at(slide: Image.Image, progress: float) -> Image.Image:
    scale = 1.0 + 0.08 * (1 - progress)  # zoom chậm từ 108% về 100%
    cw, ch = int(WIDTH * scale), int(HEIGHT * scale)
    left = (slide.width - cw) // 2
    top = (slide.height - ch) // 2
    return slide.crop((left, top, left + cw, top + ch)).resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)


def main() -> int:
    cfg = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    urls = [u for u in cfg.get("image_urls") or [] if isinstance(u, str)][:5]
    if len(urls) < 3:
        sys.stderr.write("need at least 3 images\n")
        return 2
    out = Path(cfg["output_path"])
    out.parent.mkdir(parents=True, exist_ok=True)
    silent = out.with_suffix(".video.mp4")
    per = float(cfg.get("seconds_per_image") or 3.0)
    slides = [compose_slide(fetch_image(u)) for u in urls]
    title_lines = textwrap.wrap(str(cfg.get("title") or "").strip(), width=22)[:3]
    brand = str(cfg.get("brand") or "").strip()
    overlays = {0: text_overlay(title_lines, "top", 46), len(slides) - 1: text_overlay([brand] if brand else [], "bottom", 42)}

    frames_per = int(per * FPS)
    fade_frames = int(FADE_SECONDS * FPS)
    total = frames_per * len(slides)
    ff = ffmpeg_binary()
    cmd = [ff, "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(silent)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for idx in range(total):
            s = idx // frames_per
            local = idx % frames_per
            frame = frame_at(slides[s], local / max(1, frames_per - 1))
            if s + 1 < len(slides) and local >= frames_per - fade_frames:
                alpha = (local - (frames_per - fade_frames)) / max(1, fade_frames)
                frame = Image.blend(frame, frame_at(slides[s + 1], 0.0), alpha)
            rgba = frame.convert("RGBA")
            if s in overlays:
                rgba.alpha_composite(overlays[s])
            proc.stdin.write(rgba.convert("RGB").tobytes())
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
        if proc.wait(timeout=180) != 0:
            sys.stderr.write(f"ffmpeg video failed: {err}\n")
            return 1
    except Exception as exc:  # noqa: BLE001
        proc.kill()
        sys.stderr.write(f"render failed: {exc}\n")
        return 1

    duration = total / FPS
    music = cfg.get("music_path")
    audio_in = ["-stream_loop", "-1", "-i", music] if music and os.path.exists(music) else ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
    fade = f"afade=t=out:st={max(0.0, duration - 1.5):.2f}:d=1.5"
    mux = [ff, "-loglevel", "error", "-y", "-i", str(silent), *audio_in, "-t", f"{duration:.2f}", "-af", fade, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
           "-shortest", "-movflags", "+faststart", str(out)]
    result = subprocess.run(mux, capture_output=True, timeout=120)
    silent.unlink(missing_ok=True)
    if result.returncode != 0 or not out.exists():
        sys.stderr.write(f"ffmpeg mux failed: {result.stderr.decode('utf-8', 'replace')}\n")
        return 1
    print(json.dumps({"ok": True, "output_path": str(out), "duration_s": round(duration, 2), "slides": len(slides), "music": bool(music and os.path.exists(music))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
