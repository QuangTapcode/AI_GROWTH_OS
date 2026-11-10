"""Local storage adapter for standalone AI Image Generation.

Persists generated image bytes to a controlled local filesystem directory
and provides safe path resolution with path-traversal protection.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from pathlib import Path


DEFAULT_STORAGE_DIR = (
    Path(__file__).resolve().parents[3] / "var" / "media" / "generated"
)
DEFAULT_BASE_URL = "http://127.0.0.1:5000/media/generated"
SAFE_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg"}


class StorageError(Exception):
    """Raised when an image cannot be safely stored or retrieved."""


class ImageStorage:
    """Manages local persistence for AI-generated images."""

    def __init__(
        self,
        storage_dir: Path | str | None = None,
        base_url: str | None = None,
    ) -> None:
        raw_dir = storage_dir or os.getenv("IMAGE_GENERATION_STORAGE_DIR")
        self.storage_dir = Path(raw_dir).resolve() if raw_dir else DEFAULT_STORAGE_DIR.resolve()
        self.base_url = (
            base_url
            or os.getenv("IMAGE_GENERATION_BASE_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")

    def ensure_dir(self) -> None:
        """Create storage directory if not yet created."""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _sanitize_filename(self, filename: str) -> str:
        """Ensure filename contains no directory traversal components."""
        if ".." in filename or "/" in filename or "\\" in filename:
            raise StorageError(f"Path traversal detected in filename: {filename}")
        cleaned = re.sub(r"[^\w\.-]", "_", filename)
        ext = Path(cleaned).suffix.lower()
        if ext not in SAFE_EXTENSIONS:
            raise StorageError(f"Unsupported image extension '{ext}'. Allowed: {SAFE_EXTENSIONS}")
        return cleaned

    def save_image(
        self,
        image_bytes: bytes,
        prefix: str = "gen",
        extension: str = ".png",
    ) -> tuple[Path, str, str]:
        """Save image bytes to storage with a unique, content-hashed filename.

        Returns:
            (file_path, filename, public_url)
        """
        if not image_bytes:
            raise StorageError("Cannot save empty image bytes")

        self.ensure_dir()
        ext = extension if extension.startswith(".") else f".{extension}"
        if ext.lower() not in SAFE_EXTENSIONS:
            ext = ".png"

        # Unique filename using sha256 prefix + uuid4
        content_hash = hashlib.sha256(image_bytes).hexdigest()[:16]
        unique_id = uuid.uuid4().hex[:8]
        filename = f"{prefix}_{content_hash}_{unique_id}{ext.lower()}"
        filename = self._sanitize_filename(filename)

        file_path = (self.storage_dir / filename).resolve()
        if not file_path.is_relative_to(self.storage_dir):
            raise StorageError("Path traversal check failed")

        file_path.write_bytes(image_bytes)
        public_url = f"{self.base_url}/{filename}"
        return file_path, filename, public_url

    def get_image_path(self, filename: str) -> Path:
        """Resolve and validate an existing image path."""
        safe_name = self._sanitize_filename(filename)
        path = (self.storage_dir / safe_name).resolve()
        if not path.is_relative_to(self.storage_dir):
            raise StorageError("Path traversal check failed")
        if not path.is_file():
            raise FileNotFoundError(f"Image '{safe_name}' not found")
        return path

    def read_image(self, filename: str) -> tuple[bytes, str]:
        """Read image bytes and return with its MIME content-type."""
        path = self.get_image_path(filename)
        data = path.read_bytes()
        ext = path.suffix.lower()
        mime_types = {
            ".png": "image/png",
            ".webp": "image/webp",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }
        return data, mime_types.get(ext, "application/octet-stream")

